#include <WiFi.h>
#include <HTTPClient.h>
#include "driver/i2s.h"

// =======================
// WIFI
// =======================
const char* ssid = "UoB-IoT";
const char* password = "thu7zkie";

// =======================
// API
// =======================
const char* apiUrl = "https://assist.diakonos.uk/pipeline/raw?outputType=audio";

// =======================
// TOUCH (hacky: use interrupt pin)
// =======================
#define TOUCH_INT 11

volatile bool touched = false;

void IRAM_ATTR touchISR() {
  touched = true;
}

// =======================
// SPEAKER ENABLE
// =======================
#define SPK_EN 46

// =======================
// I2S PINS
// =======================
#define I2S_BCLK 9
#define I2S_LRCLK 45
#define I2S_DIN 10   // mic
#define I2S_DOUT 8   // speaker
#define I2S_MCLK 42

// =======================
// AUDIO CONFIG
// =======================
#define SAMPLE_RATE 16000
#define BUFFER_SIZE 32000  // ~2 sec

int16_t* audioBuffer;
int sampleIndex = 0;
bool recording = false;

// =======================
// I2S INIT
// =======================
void setupI2S() {
  i2s_config_t config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count = 8,
    .dma_buf_len = 64,
    .use_apll = true
  };

  i2s_pin_config_t pins = {
    .bck_io_num = I2S_BCLK,
    .ws_io_num = I2S_LRCLK,
    .data_out_num = I2S_DOUT,
    .data_in_num = I2S_DIN
  };

  i2s_driver_install(I2S_NUM_0, &config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pins);
}

// =======================
// WAV HEADER
// =======================
void writeWavHeader(uint8_t* buffer, int dataSize) {
  int fileSize = dataSize + 36;

  memcpy(buffer, "RIFF", 4);
  *(int*)(buffer + 4) = fileSize;
  memcpy(buffer + 8, "WAVE", 4);

  memcpy(buffer + 12, "fmt ", 4);
  *(int*)(buffer + 16) = 16;
  *(short*)(buffer + 20) = 1;
  *(short*)(buffer + 22) = 1;
  *(int*)(buffer + 24) = SAMPLE_RATE;
  *(int*)(buffer + 28) = SAMPLE_RATE * 2;
  *(short*)(buffer + 32) = 2;
  *(short*)(buffer + 34) = 16;

  memcpy(buffer + 36, "data", 4);
  *(int*)(buffer + 40) = dataSize;
}

// =======================
// SEND + RECEIVE AUDIO
// =======================
void sendAudio() {
  Serial.println("Sending audio...");

  int dataSize = sampleIndex * sizeof(int16_t);
  int totalSize = dataSize + 44;

  uint8_t* wavBuffer = (uint8_t*)ps_malloc(totalSize);
  writeWavHeader(wavBuffer, dataSize);
  memcpy(wavBuffer + 44, audioBuffer, dataSize);

  HTTPClient http;
  http.begin(apiUrl);
  http.addHeader("Content-Type", "audio/wav");

  int code = http.POST(wavBuffer, totalSize);

  Serial.print("HTTP: ");
  Serial.println(code);

  if (code == 200) {
    WiFiClient* stream = http.getStreamPtr();

    Serial.println("Playing response...");

    uint8_t buf[512];
    size_t len;

    while (http.connected() && (len = stream->readBytes(buf, sizeof(buf))) > 0) {
      size_t written;
      i2s_write(I2S_NUM_0, buf, len, &written, portMAX_DELAY);
    }
  }

  http.end();
  free(wavBuffer);
}

// =======================
// SETUP
// =======================
void setup() {
  Serial.begin(115200);

  audioBuffer = (int16_t*)ps_malloc(BUFFER_SIZE * sizeof(int16_t));

  pinMode(SPK_EN, OUTPUT);
  digitalWrite(SPK_EN, HIGH);

  pinMode(TOUCH_INT, INPUT_PULLUP);
  attachInterrupt(TOUCH_INT, touchISR, FALLING);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected");

  setupI2S();
}

// =======================
// LOOP
// =======================
void loop() {

  if (touched) {
    touched = false;

    if (!recording) {
      Serial.println("START RECORDING");
      recording = true;
      sampleIndex = 0;
    } else {
      Serial.println("STOP RECORDING");
      recording = false;
      sendAudio();
    }
  }

  if (recording && sampleIndex < BUFFER_SIZE) {
    int16_t sample;
    size_t bytes_read;

    i2s_read(I2S_NUM_0, &sample, sizeof(sample), &bytes_read, portMAX_DELAY);

    if (bytes_read > 0) {
      audioBuffer[sampleIndex++] = sample;
    }
  }
}