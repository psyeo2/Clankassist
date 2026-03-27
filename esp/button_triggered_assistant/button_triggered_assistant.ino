#include <WiFi.h>
#include <HTTPClient.h>
#include "driver/i2s.h"
#include <Adafruit_NeoPixel.h>

// =======================
// WIFI
// =======================
const char* ssid = "UoB-IoT";
const char* password = "thu7zkie";

// =======================
// API
// =======================
const char* apiUrl = "https://assist.diakonos.uk/pipeline/raw?outputType=text";

// =======================
// BUTTON
// =======================
#define BUTTON_PIN 38

// =======================
// NEOPIXEL
// =======================
#define NEOPIXEL_PIN 0
#define NEOPIXEL_POWER 2

Adafruit_NeoPixel pixel(1, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);

// =======================
// I2S (your wiring)
// =======================
#define I2S_WS   14
#define I2S_SD   33
#define I2S_SCK  27

// =======================
// AUDIO
// =======================
#define SAMPLE_RATE 16000
#define RECORD_SECONDS 3
#define BUFFER_SIZE (SAMPLE_RATE * RECORD_SECONDS)

int16_t* audioBuffer;   // PSRAM allocation

bool recording = false;
int sampleIndex = 0;

// =======================
// I2S SETUP
// =======================
void setupI2S() {
  i2s_config_t config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count = 8,
    .dma_buf_len = 64,
    .use_apll = false
  };

  i2s_pin_config_t pins = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
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
// SEND AUDIO
// =======================
void sendAudio() {
  Serial.println("Sending audio...");

  int dataSize = sampleIndex * sizeof(int16_t);
  int totalSize = dataSize + 44;

  uint8_t* wavBuffer = (uint8_t*)ps_malloc(totalSize);

  if (!wavBuffer) {
    Serial.println("Failed to allocate WAV buffer");
    return;
  }

  writeWavHeader(wavBuffer, dataSize);
  memcpy(wavBuffer + 44, audioBuffer, dataSize);

  HTTPClient http;
  http.begin(apiUrl);
  http.addHeader("Content-Type", "audio/wav");

  int code = http.POST(wavBuffer, totalSize);

  Serial.print("HTTP code: ");
  Serial.println(code);

  if (code > 0) {
    String response = http.getString();
    Serial.println("Response:");
    Serial.println(response);
  } else {
    Serial.println("Request failed");
  }

  http.end();
  free(wavBuffer);
}

// =======================
// SETUP
// =======================
void setup() {
  Serial.begin(115200);

  // PSRAM allocation
  audioBuffer = (int16_t*)ps_malloc(BUFFER_SIZE * sizeof(int16_t));

  if (!audioBuffer) {
    Serial.println("PSRAM allocation failed!");
    while (true);
  }

  // button
  pinMode(BUTTON_PIN, INPUT);

  // neopixel
  pinMode(NEOPIXEL_POWER, OUTPUT);
  digitalWrite(NEOPIXEL_POWER, HIGH);

  pixel.begin();
  pixel.clear();
  pixel.show();

  // WiFi
  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nConnected!");
  Serial.println(WiFi.localIP());

  setupI2S();
}

// =======================
// LOOP
// =======================
void loop() {
  static bool lastButton = HIGH;
  bool currentButton = digitalRead(BUTTON_PIN);

  if (lastButton == HIGH && currentButton == LOW) {
    if (!recording) {
      Serial.println("START recording");
      recording = true;
      sampleIndex = 0;

      pixel.setPixelColor(0, pixel.Color(255, 0, 0));
      pixel.show();
    } else {
      Serial.println("STOP recording");
      recording = false;

      pixel.clear();
      pixel.show();

      sendAudio();
    }

    delay(300);
  }

  lastButton = currentButton;

  if (recording && sampleIndex < BUFFER_SIZE) {
    int32_t sample;
    size_t bytes_read;

    i2s_read(I2S_NUM_0, &sample, sizeof(sample), &bytes_read, portMAX_DELAY);

    if (bytes_read > 0) {
      sample = sample >> 14;
      audioBuffer[sampleIndex++] = (int16_t)sample;
    }
  }
}