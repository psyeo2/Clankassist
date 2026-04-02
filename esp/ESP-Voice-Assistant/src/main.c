#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "esp_log.h"
#include "esp_err.h"
#include "esp_check.h"
#include "esp_heap_caps.h"

#include "driver/gpio.h"
#include "driver/i2s_std.h"

// =======================
// CONFIG
// =======================
#define TAG "audio"

#define BUTTON_PIN GPIO_NUM_38  // Feather V2 button (active LOW)

// MIC (RX)
#define I2S_MIC_BCLK GPIO_NUM_27
#define I2S_MIC_WS   GPIO_NUM_14
#define I2S_MIC_DIN  GPIO_NUM_33

// SPEAKER (TX)
#define I2S_SPK_BCLK GPIO_NUM_32
#define I2S_SPK_WS   GPIO_NUM_12
#define I2S_SPK_DOUT GPIO_NUM_15

#define SAMPLE_RATE_HZ      16000
#define RECORD_SECONDS      3
#define SAMPLE_COUNT        (SAMPLE_RATE_HZ * RECORD_SECONDS)
#define AUDIO_BUFFER_BYTES  (SAMPLE_COUNT * sizeof(int16_t))

#define MIC_CHUNK_SAMPLES   256
#define SPK_CHUNK_SAMPLES   512

// =======================
// GLOBALS
// =======================
static i2s_chan_handle_t rx_handle = NULL;
static i2s_chan_handle_t tx_handle = NULL;

static int16_t *audio_buffer = NULL;
static bool recording = false;
static int sample_index = 0;

static int32_t mic_chunk[MIC_CHUNK_SAMPLES];
static int16_t spk_chunk[SPK_CHUNK_SAMPLES];

// =======================
// BUTTON
// =======================
static void init_button(void)
{
    gpio_config_t cfg = {
        .pin_bit_mask = (1ULL << BUTTON_PIN),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE, // GPIO38 has no internal PU
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
    };

    ESP_ERROR_CHECK(gpio_config(&cfg));
}

// =======================
// BUFFER
// =======================
static void init_buffer(void)
{
    audio_buffer = heap_caps_malloc(
        AUDIO_BUFFER_BYTES,
        MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT
    );

    if (!audio_buffer) {
        ESP_LOGE(TAG, "PSRAM allocation failed");
        abort();
    }

    memset(audio_buffer, 0, AUDIO_BUFFER_BYTES);
}

// =======================
// I2S MIC
// =======================
static void init_mic(void)
{
    i2s_chan_config_t chan_cfg =
        I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);

    ESP_ERROR_CHECK(i2s_new_channel(&chan_cfg, NULL, &rx_handle));

    i2s_std_config_t cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE_HZ),
        .slot_cfg = I2S_STD_MSB_SLOT_DEFAULT_CONFIG(
            I2S_DATA_BIT_WIDTH_32BIT,
            I2S_SLOT_MODE_MONO
        ),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = I2S_MIC_BCLK,
            .ws   = I2S_MIC_WS,
            .dout = I2S_GPIO_UNUSED,
            .din  = I2S_MIC_DIN,
        },
    };

    cfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;

    ESP_ERROR_CHECK(i2s_channel_init_std_mode(rx_handle, &cfg));
    ESP_ERROR_CHECK(i2s_channel_enable(rx_handle));
}

// =======================
// I2S SPEAKER
// =======================
static void init_speaker(void)
{
    i2s_chan_config_t chan_cfg =
        I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);

    ESP_ERROR_CHECK(i2s_new_channel(&chan_cfg, &tx_handle, NULL));

    i2s_std_config_t cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE_HZ),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(
            I2S_DATA_BIT_WIDTH_16BIT,
            I2S_SLOT_MODE_MONO
        ),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = I2S_SPK_BCLK,
            .ws   = I2S_SPK_WS,
            .dout = I2S_SPK_DOUT,
            .din  = I2S_GPIO_UNUSED,
        },
    };

    cfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;

    ESP_ERROR_CHECK(i2s_channel_init_std_mode(tx_handle, &cfg));
    ESP_ERROR_CHECK(i2s_channel_enable(tx_handle));
}

// =======================
// AUDIO CONVERSION
// =======================
static inline int16_t convert_sample(int32_t s)
{
    s >>= 14;

    if (s > INT16_MAX) s = INT16_MAX;
    if (s < INT16_MIN) s = INT16_MIN;

    return (int16_t)s;
}

// =======================
// RECORD
// =======================
static void record_chunk(void)
{
    if (!recording || sample_index >= SAMPLE_COUNT) return;

    int remaining = SAMPLE_COUNT - sample_index;
    int wanted = remaining < MIC_CHUNK_SAMPLES ? remaining : MIC_CHUNK_SAMPLES;

    size_t bytes_read = 0;

    esp_err_t err = i2s_channel_read(
        rx_handle,
        mic_chunk,
        wanted * sizeof(int32_t),
        &bytes_read,
        1000
    );

    if (err == ESP_ERR_TIMEOUT) return;
    ESP_ERROR_CHECK(err);

    int samples = bytes_read / sizeof(int32_t);

    for (int i = 0; i < samples; i++) {
        audio_buffer[sample_index++] = convert_sample(mic_chunk[i]);
    }
}

// =======================
// PLAYBACK (FIXED)
// =======================
static void play_audio(void)
{
    ESP_LOGI(TAG, "Playing %d samples...", sample_index);

    int offset = 0;
    int chunk_counter = 0;

    while (offset < sample_index) {
        int chunk = (sample_index - offset > SPK_CHUNK_SAMPLES)
            ? SPK_CHUNK_SAMPLES
            : (sample_index - offset);

        memcpy(spk_chunk, &audio_buffer[offset], chunk * sizeof(int16_t));

        size_t written = 0;

        esp_err_t err = i2s_channel_write(
            tx_handle,
            spk_chunk,
            chunk * sizeof(int16_t),
            &written,
            pdMS_TO_TICKS(1000)
        );

        if (err == ESP_ERR_TIMEOUT) continue;
        ESP_ERROR_CHECK(err);

        offset += written / sizeof(int16_t);

        // 🔥 watchdog fix
        chunk_counter++;
        if (chunk_counter % 4 == 0) {
            vTaskDelay(1);
        }
    }

    vTaskDelay(pdMS_TO_TICKS(100));
}

// =======================
// BUTTON EDGE
// =======================
static bool button_pressed(void)
{
    static bool last = true;
    bool now = gpio_get_level(BUTTON_PIN);

    bool pressed = (last == true && now == false);
    last = now;

    return pressed;
}

// =======================
// MAIN
// =======================
void app_main(void)
{
    ESP_LOGI(TAG, "Starting...");

    init_button();
    init_buffer();
    init_mic();
    init_speaker();

    ESP_LOGI(TAG, "Ready.");

    while (1) {
        if (button_pressed()) {
            if (!recording) {
                ESP_LOGI(TAG, "START recording");
                recording = true;
                sample_index = 0;
            } else {
                ESP_LOGI(TAG, "STOP recording");
                recording = false;
                play_audio();
            }

            vTaskDelay(pdMS_TO_TICKS(250));
        }

        if (recording) {
            record_chunk();
        } else {
            vTaskDelay(pdMS_TO_TICKS(5));
        }
    }
}