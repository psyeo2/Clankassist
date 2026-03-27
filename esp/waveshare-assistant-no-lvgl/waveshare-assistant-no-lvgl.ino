#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>

#include "Arduino_GFX_Library.h"
#include "ESP_I2S.h"
#include "TouchDrvCSTXXX.hpp"
#include "es8311.h"
#include "pin_config.h"

const char *ssid = "UoB-IoT";
const char *password = "thu7zkie";
const char *apiUrl = "https://assist.diakonos.uk/pipeline/raw?outputType=audio";

constexpr uint32_t SAMPLE_RATE = 16000;
constexpr uint8_t BITS_PER_SAMPLE = 16;
constexpr size_t READ_CHUNK_SAMPLES = 320;
constexpr size_t MAX_RECORD_SECONDS_PSRAM = 20;
constexpr size_t MAX_RECORD_SECONDS_NO_PSRAM = 6;
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 30000;
constexpr uint32_t WIFI_STATUS_LOG_MS = 2000;
constexpr uint32_t UI_UPDATE_MS = 500;
constexpr int PLAYBACK_VOLUME = 90;
constexpr es8311_mic_gain_t MIC_GAIN = (es8311_mic_gain_t)(3);

constexpr uint16_t COLOR_BG = RGB565_BLACK;
constexpr uint16_t COLOR_PANEL = 0x10A2;
constexpr uint16_t COLOR_PANEL_BORDER = 0x6B4D;
constexpr uint16_t COLOR_TEXT = RGB565_WHITE;
constexpr uint16_t COLOR_SUBTEXT = 0xC638;
constexpr uint16_t COLOR_READY = 0x2E4B;
constexpr uint16_t COLOR_BUSY = 0xD5A0;
constexpr uint16_t COLOR_RECORD = 0xC0E0;
constexpr int16_t CARD_X = 20;
constexpr int16_t CARD_Y = 18;
constexpr int16_t CARD_W = 426;
constexpr int16_t CARD_H = 210;
constexpr int16_t BUTTON_X = 73;
constexpr int16_t BUTTON_Y = 250;
constexpr int16_t BUTTON_W = 320;
constexpr int16_t BUTTON_H = 120;
constexpr int16_t BUTTON_RADIUS = 28;

struct __attribute__((packed)) PcmWavHeader {
  char riff[4];
  uint32_t fileSizeMinus8;
  char wave[4];
  char fmt[4];
  uint32_t fmtChunkSize;
  uint16_t audioFormat;
  uint16_t numChannels;
  uint32_t sampleRate;
  uint32_t byteRate;
  uint16_t blockAlign;
  uint16_t bitsPerSample;
  char data[4];
  uint32_t dataSize;
};

struct ResponseWavInfo {
  uint16_t audioFormat = 0;
  uint16_t channels = 0;
  uint16_t bitsPerSample = 0;
  uint32_t sampleRate = 0;
  uint32_t dataBytes = 0;
};

enum class AssistantState {
  Booting,
  ConnectingWiFi,
  Ready,
  Recording,
  Sending,
  Playing,
  Error
};

enum class ErrorMode {
  None,
  RetryWiFi,
  RetryRecording
};

Arduino_DataBus *bus = new Arduino_ESP32QSPI(
  LCD_CS, LCD_SCLK, LCD_SDIO0, LCD_SDIO1, LCD_SDIO2, LCD_SDIO3);

Arduino_CO5300 *gfx = new Arduino_CO5300(
  bus, LCD_RESET, 0, LCD_WIDTH, LCD_HEIGHT, 6, 0, 0, 0);

TouchDrvCST92xx touch;
I2SClass i2s;
es8311_handle_t codec = nullptr;

AssistantState state = AssistantState::Booting;
ErrorMode errorMode = ErrorMode::None;
String headline = "Booting";
String detail = "Starting display";
String footer = "";

String lastHeadlineDrawn = "";
String lastDetailDrawn = "";
String lastFooterDrawn = "";
String lastButtonLabelDrawn = "";
String lastButtonHintDrawn = "";
uint16_t lastButtonColorDrawn = 0;
bool uiFrameDrawn = false;

uint32_t wifiStartedAt = 0;
uint32_t lastWifiLogAt = 0;
wl_status_t lastLoggedWiFiStatus = WL_IDLE_STATUS;
uint32_t lastUiUpdateAt = 0;
uint32_t recordStartedAt = 0;

bool touchWasDown = false;
int16_t lastTouchX = -1;
int16_t lastTouchY = -1;
int16_t touchX[5];
int16_t touchY[5];

int16_t *recordBuffer = nullptr;
size_t maxRecordSamples = 0;
size_t recordedSamples = 0;

size_t minSize(size_t a, size_t b) {
  return a < b ? a : b;
}

String formatSeconds(uint32_t ms) {
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%.1fs", ms / 1000.0f);
  return String(buffer);
}

String wifiStatusText(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS: return "Idle";
    case WL_NO_SSID_AVAIL: return "SSID not found";
    case WL_SCAN_COMPLETED: return "Scan complete";
    case WL_CONNECTED: return "Connected";
    case WL_CONNECT_FAILED: return "Connect failed";
    case WL_CONNECTION_LOST: return "Connection lost";
    case WL_DISCONNECTED: return "Disconnected";
    default: return "Status " + String((int)status);
  }
}

void setUiState(AssistantState nextState, const String &nextHeadline, const String &nextDetail, const String &nextFooter = "") {
  state = nextState;
  headline = nextHeadline;
  detail = nextDetail;
  footer = nextFooter;
}

bool pointInButton(int16_t x, int16_t y) {
  return x >= BUTTON_X && x < (BUTTON_X + BUTTON_W) && y >= BUTTON_Y && y < (BUTTON_Y + BUTTON_H);
}

void writePcmWavHeader(PcmWavHeader &header, uint32_t dataBytes) {
  memcpy(header.riff, "RIFF", 4);
  header.fileSizeMinus8 = dataBytes + sizeof(PcmWavHeader) - 8;
  memcpy(header.wave, "WAVE", 4);
  memcpy(header.fmt, "fmt ", 4);
  header.fmtChunkSize = 16;
  header.audioFormat = 1;
  header.numChannels = 1;
  header.sampleRate = SAMPLE_RATE;
  header.byteRate = SAMPLE_RATE * (BITS_PER_SAMPLE / 8);
  header.blockAlign = BITS_PER_SAMPLE / 8;
  header.bitsPerSample = BITS_PER_SAMPLE;
  memcpy(header.data, "data", 4);
  header.dataSize = dataBytes;
}

bool readExact(Stream &stream, uint8_t *buffer, size_t length) {
  return stream.readBytes(reinterpret_cast<char *>(buffer), length) == length;
}

bool skipBytes(Stream &stream, uint32_t length) {
  uint8_t discard[128];
  while (length > 0) {
    size_t chunk = minSize(length, sizeof(discard));
    if (stream.readBytes(reinterpret_cast<char *>(discard), chunk) != chunk) {
      return false;
    }
    length -= chunk;
  }
  return true;
}

uint16_t readLe16(const uint8_t *data) {
  return (uint16_t)data[0] | ((uint16_t)data[1] << 8);
}

uint32_t readLe32(const uint8_t *data) {
  return (uint32_t)data[0] | ((uint32_t)data[1] << 8) | ((uint32_t)data[2] << 16) | ((uint32_t)data[3] << 24);
}

bool readWavInfo(Stream &stream, ResponseWavInfo &info) {
  uint8_t header[12];
  if (!readExact(stream, header, sizeof(header))) {
    return false;
  }

  if (memcmp(header, "RIFF", 4) != 0 || memcmp(header + 8, "WAVE", 4) != 0) {
    return false;
  }

  bool foundFmt = false;
  bool foundData = false;

  while (!foundData) {
    uint8_t chunkHeader[8];
    if (!readExact(stream, chunkHeader, sizeof(chunkHeader))) {
      return false;
    }

    uint32_t chunkSize = readLe32(chunkHeader + 4);
    bool oddSizedChunk = (chunkSize & 1U) != 0;

    if (memcmp(chunkHeader, "fmt ", 4) == 0) {
      if (chunkSize < 16) {
        return false;
      }
      uint8_t fmtChunk[16];
      if (!readExact(stream, fmtChunk, sizeof(fmtChunk))) {
        return false;
      }
      info.audioFormat = readLe16(fmtChunk + 0);
      info.channels = readLe16(fmtChunk + 2);
      info.sampleRate = readLe32(fmtChunk + 4);
      info.bitsPerSample = readLe16(fmtChunk + 14);
      foundFmt = true;

      if (chunkSize > 16 && !skipBytes(stream, chunkSize - 16)) {
        return false;
      }
    } else if (memcmp(chunkHeader, "data", 4) == 0) {
      info.dataBytes = chunkSize;
      foundData = true;
    } else {
      if (!skipBytes(stream, chunkSize)) {
        return false;
      }
    }

    if (!foundData && oddSizedChunk && !skipBytes(stream, 1)) {
      return false;
    }
  }

  return foundFmt && foundData;
}

void drawCenteredText(const String &text, int16_t centerX, int16_t y, uint8_t textSize, uint16_t color) {
  int16_t x1;
  int16_t y1;
  uint16_t w;
  uint16_t h;
  gfx->setTextSize(textSize);
  gfx->getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  int16_t cursorX = centerX - (int16_t)(w / 2);
  if (cursorX < 6) {
    cursorX = 6;
  }
  gfx->setCursor(cursorX, y);
  gfx->setTextColor(color);
  gfx->print(text);
}

void drawStaticFrame() {
  gfx->fillScreen(COLOR_BG);
  gfx->fillRoundRect(CARD_X, CARD_Y, CARD_W, CARD_H, 30, COLOR_PANEL);
  gfx->drawRoundRect(CARD_X, CARD_Y, CARD_W, CARD_H, 30, COLOR_PANEL_BORDER);
  drawCenteredText("Waveshare Assistant", LCD_WIDTH / 2, 48, 2, COLOR_TEXT);
  drawCenteredText("Touchscreen start/stop, audio mode API, streamed WAV reply", LCD_WIDTH / 2, 432, 1, COLOR_SUBTEXT);
  uiFrameDrawn = true;
  lastHeadlineDrawn = "";
  lastDetailDrawn = "";
  lastFooterDrawn = "";
  lastButtonLabelDrawn = "";
  lastButtonHintDrawn = "";
  lastButtonColorDrawn = 0;
}

void updateHeadlineArea() {
  if (headline == lastHeadlineDrawn) {
    return;
  }
  gfx->fillRect(36, 92, 394, 36, COLOR_PANEL);
  drawCenteredText(headline, LCD_WIDTH / 2, 104, 3, COLOR_TEXT);
  lastHeadlineDrawn = headline;
}

void updateDetailArea() {
  if (detail == lastDetailDrawn) {
    return;
  }
  gfx->fillRect(36, 142, 394, 34, COLOR_PANEL);
  drawCenteredText(detail, LCD_WIDTH / 2, 152, 2, COLOR_SUBTEXT);
  lastDetailDrawn = detail;
}

void updateFooterArea() {
  if (footer == lastFooterDrawn) {
    return;
  }
  gfx->fillRect(36, 186, 394, 20, COLOR_PANEL);
  if (footer.length() > 0) {
    drawCenteredText(footer, LCD_WIDTH / 2, 192, 1, COLOR_SUBTEXT);
  }
  lastFooterDrawn = footer;
}

void currentButtonUi(String &buttonLabel, String &buttonHint, uint16_t &buttonColor) {
  buttonColor = COLOR_READY;
  buttonLabel = "Tap To Record";
  buttonHint = "Touch again to stop";

  if (state == AssistantState::ConnectingWiFi) {
    buttonColor = COLOR_BUSY;
    buttonLabel = "Connecting";
    buttonHint = "Please wait";
  } else if (state == AssistantState::Recording) {
    buttonColor = COLOR_RECORD;
    buttonLabel = "Tap To Stop";
    buttonHint = formatSeconds(millis() - recordStartedAt) + " / " + String((uint32_t)(maxRecordSamples / SAMPLE_RATE)) + "s max";
  } else if (state == AssistantState::Sending) {
    buttonColor = COLOR_BUSY;
    buttonLabel = "Sending";
    buttonHint = "Uploading audio";
  } else if (state == AssistantState::Playing) {
    buttonColor = COLOR_BUSY;
    buttonLabel = "Playing";
    buttonHint = "Streaming response";
  } else if (state == AssistantState::Error && errorMode == ErrorMode::RetryWiFi) {
    buttonColor = COLOR_RECORD;
    buttonLabel = "Retry WiFi";
    buttonHint = "Tap to reconnect";
  } else if (state == AssistantState::Error) {
    buttonColor = COLOR_RECORD;
    buttonLabel = "Try Again";
    buttonHint = "Tap to record again";
  }
}

void updateButtonArea(bool force = false) {
  String buttonLabel;
  String buttonHint;
  uint16_t buttonColor;
  currentButtonUi(buttonLabel, buttonHint, buttonColor);

  if (!force &&
      buttonLabel == lastButtonLabelDrawn &&
      buttonHint == lastButtonHintDrawn &&
      buttonColor == lastButtonColorDrawn) {
    return;
  }

  gfx->fillRoundRect(BUTTON_X, BUTTON_Y, BUTTON_W, BUTTON_H, BUTTON_RADIUS, buttonColor);
  gfx->drawRoundRect(BUTTON_X, BUTTON_Y, BUTTON_W, BUTTON_H, BUTTON_RADIUS, COLOR_TEXT);
  drawCenteredText(buttonLabel, LCD_WIDTH / 2, 292, 3, COLOR_TEXT);
  drawCenteredText(buttonHint, LCD_WIDTH / 2, 340, 1, COLOR_TEXT);

  lastButtonLabelDrawn = buttonLabel;
  lastButtonHintDrawn = buttonHint;
  lastButtonColorDrawn = buttonColor;
}

void renderUi(bool force = false) {
  if (!uiFrameDrawn || force) {
    drawStaticFrame();
    force = true;
  }

  updateHeadlineArea();
  updateDetailArea();
  updateFooterArea();
  updateButtonArea(force);
}

void startWifiConnection() {
  errorMode = ErrorMode::None;
  WiFi.disconnect(true, true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(ssid, password);
  wifiStartedAt = millis();
  lastWifiLogAt = 0;
  lastLoggedWiFiStatus = WL_IDLE_STATUS;
  setUiState(AssistantState::ConnectingWiFi, "Connecting WiFi", ssid, "Waiting for association");
  renderUi();
  Serial.println();
  Serial.println("=== WiFi Connect Start ===");
  Serial.printf("SSID: %s\n", ssid);
  Serial.printf("Started at: %lu ms\n", wifiStartedAt);
}

bool initDisplay() {
  if (!gfx->begin()) {
    return false;
  }

  gfx->fillScreen(COLOR_BG);
  gfx->setBrightness(200);
  gfx->setTextWrap(false);
  gfx->setTextColor(COLOR_TEXT);
  gfx->setCursor(12, 36);
  gfx->setTextSize(2);
  gfx->println("Waveshare Assistant");
  gfx->setCursor(12, 68);
  gfx->setTextSize(1);
  gfx->println("Display online");
  return true;
}

bool initTouch() {
  pinMode(TP_RESET, OUTPUT);
  digitalWrite(TP_RESET, LOW);
  delay(30);
  digitalWrite(TP_RESET, HIGH);
  delay(50);
  delay(1000);

  touch.setPins(TP_RESET, TP_INT);
  if (!touch.begin(Wire, 0x5A, IIC_SDA, IIC_SCL)) {
    return false;
  }

  touch.setMaxCoordinates(LCD_WIDTH, LCD_HEIGHT);
  touch.setMirrorXY(true, true);
  return true;
}

bool initAudio() {
  pinMode(PA, OUTPUT);
  digitalWrite(PA, HIGH);

  i2s.setTimeout(20);
  i2s.setPins(BCLKPIN, WSPIN, DIPIN, DOPIN, MCLKPIN);
  if (!i2s.begin(I2S_MODE_STD, SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO, I2S_STD_SLOT_BOTH)) {
    return false;
  }

  if (!i2s.configureRX(SAMPLE_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO, I2S_RX_TRANSFORM_16_STEREO_TO_MONO)) {
    return false;
  }

  codec = es8311_create(0, ES8311_ADDRRES_0);
  if (codec == nullptr) {
    return false;
  }

  const es8311_clock_config_t clockConfig = {
    .mclk_inverted = false,
    .sclk_inverted = false,
    .mclk_from_mclk_pin = true,
    .mclk_frequency = SAMPLE_RATE * 256,
    .sample_frequency = SAMPLE_RATE
  };

  if (es8311_init(codec, &clockConfig, ES8311_RESOLUTION_16, ES8311_RESOLUTION_16) != ESP_OK) {
    return false;
  }
  if (es8311_sample_frequency_config(codec, clockConfig.mclk_frequency, clockConfig.sample_frequency) != ESP_OK) {
    return false;
  }
  if (es8311_microphone_config(codec, false) != ESP_OK) {
    return false;
  }
  if (es8311_microphone_gain_set(codec, MIC_GAIN) != ESP_OK) {
    return false;
  }
  if (es8311_voice_volume_set(codec, PLAYBACK_VOLUME, nullptr) != ESP_OK) {
    return false;
  }
  return es8311_voice_mute(codec, false) == ESP_OK;
}

void beginRecording() {
  recordedSamples = 0;
  recordStartedAt = millis();
  errorMode = ErrorMode::None;
  setUiState(AssistantState::Recording, "Recording", "Tap the button again to stop");
  renderUi();
  Serial.println("=== Recording Started ===");
  Serial.printf("Start time: %lu ms\n", recordStartedAt);
  Serial.printf("Max samples: %u\n", (unsigned int)maxRecordSamples);
}

void requestStopRecording() {
  uint32_t durationMs = millis() - recordStartedAt;
  Serial.println("=== Recording Stop Requested ===");
  Serial.printf("Duration: %lu ms\n", durationMs);
  Serial.printf("Samples captured so far: %u\n", (unsigned int)recordedSamples);
  setUiState(AssistantState::Sending, "Sending", "Uploading " + formatSeconds(durationMs));
  renderUi();
}

void handleTouch() {
  uint8_t touched = touch.getPoint(touchX, touchY, 1);
  bool touchDown = touched > 0;

  if (touchDown) {
    lastTouchX = touchX[0];
    lastTouchY = touchY[0];
  }

  if (!touchDown && touchWasDown && pointInButton(lastTouchX, lastTouchY)) {
    if (state == AssistantState::Ready) {
      beginRecording();
    } else if (state == AssistantState::Recording) {
      requestStopRecording();
    } else if (state == AssistantState::Error && errorMode == ErrorMode::RetryWiFi) {
      Serial.println("=== Retry WiFi Requested ===");
      startWifiConnection();
    } else if (state == AssistantState::Error && errorMode == ErrorMode::RetryRecording) {
      Serial.println("=== Recording Retry Requested ===");
      beginRecording();
    }
  }

  touchWasDown = touchDown;
}

bool streamAudioResponse(HTTPClient &http) {
  NetworkClient *stream = http.getStreamPtr();
  if (stream == nullptr) {
    return false;
  }

  stream->setTimeout(2000);

  ResponseWavInfo info;
  if (!readWavInfo(*stream, info)) {
    Serial.println("Failed to parse WAV response");
    return false;
  }

  if (info.audioFormat != 1 || info.bitsPerSample != 16 || (info.channels != 1 && info.channels != 2)) {
    Serial.printf("Unsupported WAV format: format=%u channels=%u bits=%u\n", info.audioFormat, info.channels, info.bitsPerSample);
    return false;
  }

  if (!i2s.configureTX(info.sampleRate, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO)) {
    return false;
  }

  const size_t inputChunkBytes = 2048;
  uint8_t *inputBuffer = (uint8_t *)malloc(inputChunkBytes);
  uint8_t *stereoBuffer = (info.channels == 1) ? (uint8_t *)malloc(inputChunkBytes * 2) : nullptr;
  if (inputBuffer == nullptr || (info.channels == 1 && stereoBuffer == nullptr)) {
    free(inputBuffer);
    free(stereoBuffer);
    return false;
  }

  uint32_t remaining = info.dataBytes;
  while (remaining > 0) {
    size_t toRead = minSize(remaining, inputChunkBytes);
    size_t bytesRead = stream->readBytes(reinterpret_cast<char *>(inputBuffer), toRead);
    if (bytesRead == 0) {
      break;
    }

    if (info.channels == 1) {
      size_t sampleCount = bytesRead / sizeof(int16_t);
      int16_t *src = reinterpret_cast<int16_t *>(inputBuffer);
      int16_t *dst = reinterpret_cast<int16_t *>(stereoBuffer);
      for (size_t i = 0; i < sampleCount; ++i) {
        dst[i * 2] = src[i];
        dst[i * 2 + 1] = src[i];
      }
      i2s.write(stereoBuffer, sampleCount * sizeof(int16_t) * 2);
    } else {
      i2s.write(inputBuffer, bytesRead);
    }

    remaining -= bytesRead;
  }

  free(inputBuffer);
  free(stereoBuffer);
  return remaining == 0;
}

bool sendAudioAndPlayResponse() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Cannot send audio: WiFi not connected");
    errorMode = ErrorMode::RetryWiFi;
    setUiState(AssistantState::Error, "WiFi Lost", "Reconnect before sending audio", wifiStatusText(WiFi.status()));
    renderUi();
    return false;
  }

  const uint32_t pcmBytes = recordedSamples * sizeof(int16_t);
  const size_t wavBytes = sizeof(PcmWavHeader) + pcmBytes;
  uint8_t *wavBuffer = (uint8_t *)ps_malloc(wavBytes);
  if (wavBuffer == nullptr) {
    wavBuffer = (uint8_t *)malloc(wavBytes);
  }

  if (wavBuffer == nullptr) {
    errorMode = ErrorMode::RetryRecording;
    setUiState(AssistantState::Error, "Memory Error", "Could not allocate WAV buffer");
    renderUi();
    return false;
  }

  PcmWavHeader header;
  writePcmWavHeader(header, pcmBytes);
  memcpy(wavBuffer, &header, sizeof(header));
  memcpy(wavBuffer + sizeof(header), recordBuffer, pcmBytes);

  Serial.println("=== API Request Start ===");
  Serial.printf("Recorded samples: %u\n", (unsigned int)recordedSamples);
  Serial.printf("PCM bytes: %lu\n", pcmBytes);
  Serial.printf("WAV bytes: %u\n", (unsigned int)wavBytes);
  Serial.printf("POST %s\n", apiUrl);

  WiFiClientSecure secureClient;
  secureClient.setInsecure();

  HTTPClient http;
  if (!http.begin(secureClient, apiUrl)) {
    free(wavBuffer);
    errorMode = ErrorMode::RetryRecording;
    setUiState(AssistantState::Error, "HTTP Error", "Failed to open request");
    renderUi();
    return false;
  }

  http.setTimeout(30000);
  http.addHeader("Content-Type", "audio/wav");
  http.addHeader("Accept", "audio/wav");

  int code = http.POST(wavBuffer, wavBytes);
  free(wavBuffer);

  Serial.println("=== API Response ===");
  Serial.printf("HTTP code: %d\n", code);

  if (code != HTTP_CODE_OK) {
    String responseBody = http.getString();
    Serial.printf("Response body: %s\n", responseBody.c_str());
    http.end();
    errorMode = ErrorMode::RetryRecording;
    setUiState(AssistantState::Error, "API Error", "HTTP " + String(code), responseBody.substring(0, 52));
    renderUi();
    return false;
  }

  setUiState(AssistantState::Playing, "Playing", "Streaming assistant response");
  renderUi();

  bool success = streamAudioResponse(http);
  http.end();

  if (!success) {
    Serial.println("Audio playback failed after API response");
    errorMode = ErrorMode::RetryRecording;
    setUiState(AssistantState::Error, "Playback Error", "Could not stream WAV response");
    renderUi();
    return false;
  }

  Serial.println("Assistant response playback completed");
  errorMode = ErrorMode::None;
  setUiState(AssistantState::Ready, "Ready", "Tap the button to talk", WiFi.localIP().toString());
  renderUi();
  return true;
}

void pollWifiConnection() {
  if (state != AssistantState::ConnectingWiFi) {
    return;
  }

  wl_status_t wifiStatus = WiFi.status();
  if (wifiStatus != lastLoggedWiFiStatus || millis() - lastWifiLogAt >= WIFI_STATUS_LOG_MS) {
    lastLoggedWiFiStatus = wifiStatus;
    lastWifiLogAt = millis();
    Serial.printf("WiFi status: %s (%d), elapsed: %lu ms\n",
                  wifiStatusText(wifiStatus).c_str(),
                  (int)wifiStatus,
                  millis() - wifiStartedAt);
  }

  if (wifiStatus == WL_CONNECTED) {
    errorMode = ErrorMode::None;
    setUiState(AssistantState::Ready, "Ready", "Tap the button to talk", WiFi.localIP().toString());
    renderUi();
    Serial.println("=== WiFi Connected ===");
    Serial.printf("WiFi connected: %s\n", WiFi.localIP().toString().c_str());
    return;
  }

  if (millis() - lastUiUpdateAt >= UI_UPDATE_MS) {
    lastUiUpdateAt = millis();
    footer = "Status: " + wifiStatusText(wifiStatus) + "  " + formatSeconds(millis() - wifiStartedAt);
    renderUi();
  }

  if (wifiStatus == WL_CONNECT_FAILED || wifiStatus == WL_NO_SSID_AVAIL || millis() - wifiStartedAt >= WIFI_CONNECT_TIMEOUT_MS) {
    errorMode = ErrorMode::RetryWiFi;
    setUiState(AssistantState::Error, "WiFi Failed", "Could not connect to network", wifiStatusText(wifiStatus));
    renderUi();
    Serial.println("=== WiFi Connection Failed ===");
    Serial.printf("WiFi failed: %s\n", wifiStatusText(wifiStatus).c_str());
  }
}

void sampleMicrophone() {
  if (state != AssistantState::Recording) {
    return;
  }

  if (recordedSamples >= maxRecordSamples) {
    Serial.println("Recording reached max buffer; stopping automatically");
    requestStopRecording();
    return;
  }

  size_t samplesToRead = minSize(READ_CHUNK_SAMPLES, maxRecordSamples - recordedSamples);
  size_t bytesRead = i2s.readBytes(reinterpret_cast<char *>(recordBuffer + recordedSamples), samplesToRead * sizeof(int16_t));
  recordedSamples += bytesRead / sizeof(int16_t);

  if (millis() - lastUiUpdateAt >= UI_UPDATE_MS) {
    lastUiUpdateAt = millis();
    updateButtonArea();
  }
}

void handleStateTransitions() {
  if (state != AssistantState::Sending) {
    return;
  }

  if (recordedSamples == 0) {
    Serial.println("Recording stopped with zero captured samples");
    errorMode = ErrorMode::RetryRecording;
    setUiState(AssistantState::Error, "No Audio", "Nothing was recorded");
    renderUi();
    return;
  }

  Serial.println("=== Recording Stopped ===");
  Serial.printf("Duration: %lu ms\n", millis() - recordStartedAt);
  Serial.printf("Total samples: %u\n", (unsigned int)recordedSamples);
  Serial.printf("Total PCM bytes: %lu\n", (unsigned long)(recordedSamples * sizeof(int16_t)));
  sendAudioAndPlayResponse();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("=== Waveshare Assistant Boot ===");
  Serial.flush();

  if (!initDisplay()) {
    while (true) {
      delay(1000);
    }
  }

  Wire.begin(IIC_SDA, IIC_SCL);
  Serial.printf("I2C started on SDA=%d SCL=%d\n", IIC_SDA, IIC_SCL);

  drawStaticFrame();
  setUiState(AssistantState::Booting, "Booting", "Starting peripherals");
  renderUi();

  if (!initTouch()) {
    Serial.println("Touch init failed");
    errorMode = ErrorMode::RetryRecording;
    setUiState(AssistantState::Error, "Touch Failed", "Touch controller did not start");
    renderUi();
    while (true) {
      delay(1000);
    }
  }
  Serial.println("Touch init OK");

  if (!initAudio()) {
    Serial.println("Audio init failed");
    errorMode = ErrorMode::RetryRecording;
    setUiState(AssistantState::Error, "Audio Failed", "Could not start ES8311 / I2S");
    renderUi();
    return;
  }
  Serial.println("Audio init OK");

  size_t maxRecordSeconds = psramFound() ? MAX_RECORD_SECONDS_PSRAM : MAX_RECORD_SECONDS_NO_PSRAM;
  maxRecordSamples = SAMPLE_RATE * maxRecordSeconds;
  recordBuffer = (int16_t *)ps_malloc(maxRecordSamples * sizeof(int16_t));
  if (recordBuffer == nullptr) {
    recordBuffer = (int16_t *)malloc(maxRecordSamples * sizeof(int16_t));
  }

  if (recordBuffer == nullptr) {
    Serial.println("Record buffer allocation failed");
    errorMode = ErrorMode::RetryRecording;
    setUiState(AssistantState::Error, "Memory Failed", "Could not allocate record buffer");
    renderUi();
    return;
  }

  Serial.printf("Record buffer allocated: %u samples (%u seconds)\n",
                (unsigned int)maxRecordSamples,
                (unsigned int)maxRecordSeconds);

  startWifiConnection();
}

void loop() {
  handleTouch();
  pollWifiConnection();
  sampleMicrophone();
  handleStateTransitions();
  delay(5);
}
