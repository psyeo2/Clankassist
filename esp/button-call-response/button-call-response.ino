#include "driver/i2s.h"

// =======================
// BUTTON
// =======================
#define BUTTON_PIN 38

// =======================
// MIC (INPUT)
// =======================
#define I2S_MIC_WS   14
#define I2S_MIC_SD   33
#define I2S_MIC_SCK  27

// =======================
// SPEAKER (OUTPUT)
// =======================
#define I2S_SPK_WS   12
#define I2S_SPK_DOUT 15
#define I2S_SPK_BCK  32

// =======================
#define I2S_PORT I2S_NUM_0

#define SAMPLE_RATE 16000
#define RECORD_SECONDS 3
#define BUFFER_SIZE (SAMPLE_RATE * RECORD_SECONDS)

int16_t* audioBuffer;

bool recording = false;
int sampleIndex = 0;

// =======================
// SETUP MIC (RX)
// =======================
void setupMic() {
  i2s_driver_uninstall(I2S_PORT);

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
    .bck_io_num = I2S_MIC_SCK,
    .ws_io_num = I2S_MIC_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_MIC_SD
  };

  i2s_driver_install(I2S_PORT, &config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pins);
}

// =======================
// SETUP SPEAKER (TX)
// =======================
void setupSpeaker() {
  i2s_driver_uninstall(I2S_PORT);

  i2s_config_t config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count = 8,
    .dma_buf_len = 64,
    .use_apll = false
  };

  i2s_pin_config_t pins = {
    .bck_io_num = I2S_SPK_BCK,
    .ws_io_num = I2S_SPK_WS,
    .data_out_num = I2S_SPK_DOUT,
    .data_in_num = I2S_PIN_NO_CHANGE
  };

  i2s_driver_install(I2S_PORT, &config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pins);
}

// =======================
// PLAYBACK
// =======================
void playAudio() {
  Serial.println("Playing...");

  setupSpeaker();

  size_t bytes_written;

  for (int i = 0; i < sampleIndex; i++) {
    int16_t sample = audioBuffer[i];
    i2s_write(I2S_PORT, &sample, sizeof(sample), &bytes_written, portMAX_DELAY);
  }

  delay(200);

  setupMic(); // switch back to mic
}

// =======================
// SETUP
// =======================
void setup() {
  Serial.begin(115200);

  pinMode(BUTTON_PIN, INPUT);

  audioBuffer = (int16_t*)ps_malloc(BUFFER_SIZE * sizeof(int16_t));

  if (!audioBuffer) {
    Serial.println("PSRAM allocation failed!");
    while (true);
  }

  setupMic();

  Serial.println("Ready.");
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
    } else {
      Serial.println("STOP recording");
      recording = false;

      playAudio();
    }

    delay(300); // debounce
  }

  lastButton = currentButton;

  if (recording && sampleIndex < BUFFER_SIZE) {
    int32_t sample;
    size_t bytes_read;

    i2s_read(I2S_PORT, &sample, sizeof(sample), &bytes_read, portMAX_DELAY);

    if (bytes_read > 0) {
      sample = sample >> 14; // convert 32 → 16 bit
      audioBuffer[sampleIndex++] = (int16_t)sample;
    }
  }
}