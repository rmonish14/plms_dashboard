#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ---------------------------------------------------------------------------------
// PLMS ESP32 MQTT Node (Predictive Life Monitoring System)
// Connects to WiFi, connects to HiveMQ Public Broker, and sends Machine Health data.
// Intended to connect over Serial (UART) to STM32 Nucleo F411RE to get sensor data.
// ---------------------------------------------------------------------------------

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// MQTT Configuration
const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;

// Topic Configuration
const char* NODE_ID = "machine-alpha";
String dataTopic = String("plms/") + NODE_ID + "/data";     // Keeps `plms` prefix to work with backend wildcard without backend changes
String statusTopic = String("plms/") + NODE_ID + "/status";

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0;
const long interval = 5000;

// Variables synced from STM32
float vib = 0.0;
float temp = 0.0;
float hum = 0.0;
float current_draw = 0.0;
String ml_status = "HEALTHY";

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    String clientId = "PLMS_Node_";
    clientId += String(random(0xffff), HEX);

    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
      // Publish online status
      client.publish(statusTopic.c_str(), "online", true);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void readDataFromSTM32() {
  // NOTE FOR USER:
  // Here you will use hardware or software serial to read the telemetry from STM32 Nucleo F411RE.
  // For demonstration, we simply simulate the variables.
  // E.g.: if (Serial2.available()) { ... parse String ... }
  vib = random(10, 50) / 10.0;     // 1.0 to 5.0 mm/s
  temp = random(400, 800) / 10.0;  // 40.0 to 80.0 °C
  hum = random(300, 600) / 10.0;   // 30.0 to 60.0 %
  current_draw = random(100, 250) / 10.0; // 10.0 to 25.0 A
  
  if (vib > 4.5 || temp > 75.0) {
    ml_status = "WARNING";
  } else {
    ml_status = "HEALTHY";
  }
}

void publishData() {
  // Allocate memory for JSON
  StaticJsonDocument<256> doc;

  doc["device_id"] = NODE_ID;
  doc["vib"] = vib;
  doc["temp"] = temp;
  doc["hum"] = hum;
  doc["current"] = current_draw;
  doc["ml_status"] = ml_status;
  
  // You can include coordinates if your machines are physically distributed outdoors
  doc["lat"] = 28.6139;
  doc["long"] = 77.2090;

  char jsonString[256];
  serializeJson(doc, jsonString);

  client.publish(dataTopic.c_str(), jsonString);
  Serial.println("Message published:");
  Serial.println(jsonString);
}

void setup() {
  Serial.begin(115200);
  // Serial2.begin(9600); // Intialise Serial2 for STM32 comms (RXD2, TXD2)
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  if (now - lastMsg > interval) {
    lastMsg = now;
    readDataFromSTM32();
    publishData();
  }
}
