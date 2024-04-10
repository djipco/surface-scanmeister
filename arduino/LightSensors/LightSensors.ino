// Configuration
const int DELAY = 25;
const int NUMBER_OF_INPUTS = 6;

// Variables
float values[NUMBER_OF_INPUTS];

// Setup
void setup() {
  Serial.begin(115200);
}

// Read data from analog pin, accounting for the non-linarity of the photoresistors
float readPhotoresistor(int pin) {

  int rawValue = analogRead(pin);
  int mappedValue;

  if (rawValue < 300) {                                   // dark
    mappedValue = map(rawValue, 0, 300, 0, 50);
  } else if (rawValue < 600) {                            // average
    mappedValue = map(rawValue, 300, 600, 50, 500);
  } else {                                                // bright
    mappedValue = map(rawValue, 600, 1023, 500, 1000);
  }

  return mappedValue / 1023.0;
  
}

// Loop
void loop() {

  // Loop through all configured analog pins to get the reading
  for (int i = 0; i < NUMBER_OF_INPUTS; i++) {

    // Get value and print it
    values[i] = readPhotoresistor(i);
    Serial.print(values[i], 3);

    // Print separator (except after last value where we print \n)
    if (i < NUMBER_OF_INPUTS - 1) {
      Serial.print(",");
    } else {
      Serial.println();
    }

  }

  // Wait a little
  delay(DELAY);

}
