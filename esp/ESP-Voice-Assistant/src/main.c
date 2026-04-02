#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "esp_log.h"
#include "esp_heap_caps.h"

#include "driver/gpio.h"
#include "driver/i2s_std.h"

// =======================
#define TAG "audio"

#define BUTTON_PIN GPIO_NUM_38

#define SAMPLE_RATE 16000
#define RECORD_SECONDS 3
#define SAMPLE_COUNT (SAMPLE_RATE * RECORD_SECONDS)

#define MIC_CHUNK 256
#define SPK_CHUNK 512

// =======================
// I2S PINS
// =======================
#define I2S_MIC_BCLK GPIO_NUM_27
#define I2S_MIC_WS   GPIO_NUM_14
#define I2S_MIC_DIN  GPIO_NUM_33

#define I2S_SPK_BCLK GPIO_NUM_32
#define I2S_SPK_WS   GPIO_NUM_12
#define I2S_SPK_DOUT GPIO_NUM_15

// =======================
static i2s_chan_handle_t rx;
static i2s_chan_handle_t tx;

static int16_t *buffer;

static volatile bool recording = false;
static volatile int index_ = 0;

static TaskHandle_t playback_task_handle = NULL;

// =======================
// INIT
// =======================
static void init_button()
{
    gpio_config_t cfg = {
        .pin_bit_mask = (1ULL << BUTTON_PIN),
        .mode = GPIO_MODE_INPUT,
    };
    gpio_config(&cfg);
}

static void init_buffer()
{
    buffer = heap_caps_malloc(
        SAMPLE_COUNT * sizeof(int16_t),
        MALLOC_CAP_SPIRAM
    );

    if (!buffer) {
        ESP_LOGE(TAG, "PSRAM failed");
        abort();
    }
}

static void init_mic()
{
    i2s_chan_config_t c =
        I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);

    i2s_new_channel(&c, NULL, &rx);

    i2s_std_config_t cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
        .slot_cfg = I2S_STD_MSB_SLOT_DEFAULT_CONFIG(
            I2S_DATA_BIT_WIDTH_32BIT,
            I2S_SLOT_MODE_MONO
        ),
        .gpio_cfg = {
            .bclk = I2S_MIC_BCLK,
            .ws   = I2S_MIC_WS,
            .din  = I2S_MIC_DIN,
            .mclk = I2S_GPIO_UNUSED,
            .dout = I2S_GPIO_UNUSED,
        }
    };

    cfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;

    i2s_channel_init_std_mode(rx, &cfg);
    i2s_channel_enable(rx);
}

static void init_spk()
{
    i2s_chan_config_t c =
        I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);

    i2s_new_channel(&c, &tx, NULL);

    i2s_std_config_t cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(
            I2S_DATA_BIT_WIDTH_16BIT,
            I2S_SLOT_MODE_MONO
        ),
        .gpio_cfg = {
            .bclk = I2S_SPK_BCLK,
            .ws   = I2S_SPK_WS,
            .dout = I2S_SPK_DOUT,
            .mclk = I2S_GPIO_UNUSED,
            .din  = I2S_GPIO_UNUSED,
        }
    };

    cfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;

    i2s_channel_init_std_mode(tx, &cfg);
    i2s_channel_enable(tx);
}

// =======================
// RECORD
// =======================
static int32_t mic_chunk[MIC_CHUNK];

static void record_step()
{
    if (!recording || index_ >= SAMPLE_COUNT) return;

    size_t bytes;
    i2s_channel_read(rx, mic_chunk, sizeof(mic_chunk), &bytes, 1000);

    int samples = bytes / sizeof(int32_t);

    for (int i = 0; i < samples && index_ < SAMPLE_COUNT; i++) {
        buffer[index_++] = mic_chunk[i] >> 14;
    }
}

// =======================
// PLAYBACK TASK
// =======================
static int16_t spk_chunk[SPK_CHUNK];

static void playback_task(void *arg)
{
    int total = index_;

    ESP_LOGI(TAG, "Playing %d samples...", total);

    int offset = 0;

    while (offset < total) {
        int n = (total - offset > SPK_CHUNK)
            ? SPK_CHUNK
            : (total - offset);

        memcpy(spk_chunk, &buffer[offset], n * sizeof(int16_t));

        size_t written;
        i2s_channel_write(tx, spk_chunk, n * sizeof(int16_t), &written, 1000);

        offset += written / sizeof(int16_t);
    }

    vTaskDelay(pdMS_TO_TICKS(100));

    // flush silence
    memset(spk_chunk, 0, sizeof(spk_chunk));

    for (int i = 0; i < 10; i++) {
        size_t written;
        i2s_channel_write(tx, spk_chunk, sizeof(spk_chunk), &written, 100);
    }

    // reset TX channel (VERY IMPORTANT)
    i2s_channel_disable(tx);
    i2s_channel_enable(tx);

    playback_task_handle = NULL;
    vTaskDelete(NULL);
}

// =======================
// BUTTON
// =======================
static bool pressed()
{
    static bool last = 1;
    bool now = gpio_get_level(BUTTON_PIN);

    bool p = (last == 1 && now == 0);
    last = now;

    return p;
}

// =======================
// MAIN
// =======================
void app_main()
{
    ESP_LOGI(TAG, "Starting...");

    init_button();
    init_buffer();
    init_mic();
    init_spk();

    ESP_LOGI(TAG, "Ready.");

    while (1) {
        if (pressed()) {
            if (!recording) {
                ESP_LOGI(TAG, "START recording");
                recording = true;
                index_ = 0;
            } else {
                ESP_LOGI(TAG, "STOP recording");
                recording = false;

                if (playback_task_handle == NULL) {
                    xTaskCreate(
                        playback_task,
                        "playback",
                        4096,
                        NULL,
                        5,
                        &playback_task_handle
                    );
                }
            }

            vTaskDelay(pdMS_TO_TICKS(250));
        }

        record_step();

        vTaskDelay(1); // always yield
    }
}