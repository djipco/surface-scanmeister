export class App {

  static STATE_STANDBY = 0;
  static STATE_REQUEST_SENT = 1;
  static STATE_HEADER_PARSED = 2;
  static STATE_DATA_PARSED = 3;
  static URL = "http://127.0.0.1:5678";

  constructor() {
    this.canvas = document.getElementById('canvas');
    this.channel = undefined;
    this.context = this.canvas.getContext('2d');
    this.response = undefined;
    this.reader = undefined;
    this.imageData = new Uint8Array();
    this.state = App.STATE_STANDBY;
    this.header = '';
    this.buffer = new Uint8Array();
    this.position = 0;
    this.setUpUi();
  }

  setUpUi() {
    const buttons = document.getElementsByTagName("button");

    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      button.addEventListener('click', () => this.getImage(button.innerText));
    }
  }

  async getImage(device = 1) {
    this.channel = parseInt(device);
    this.state = App.STATE_REQUEST_SENT;
    this.response = await fetch(App.URL + "/scan/" + this.channel);
    this.reader = this.response.body.getReader();
    this.#processChunk();
  }

  async #processChunk() {

    // Check if the reader is ready
    if (!this.reader) return;

    // Read from reader
    let {done, value} = await this.reader.read();

    // Parse header (if not done already)
    if (this.state == App.STATE_REQUEST_SENT) {

      // Add one character at a time and check if the header is complete.
      for (let i = 0; i < value.length; i++) {

        // Get a single character and add it to header. Remove all comment lines and count the
        // number of remaining lines. As soon as we have 4 lines (format, width + height, color
        // depth, empty string), the header is complete.
        this.header += String.fromCharCode(value[i]);
        const lines = this.header.split("\n").filter(line => !line.startsWith("#"));

        if (lines.length >= 4) {

          // Retrieve all tokens
          const tokens = lines.join(" ").split(/\s+/g);
          this.format = tokens[0];
          this.width = parseInt(tokens[1]);
          this.height = parseInt(tokens[2]);
          console.log(this.width, this.height);

          document.getElementById("size").innerText = `${this.width} × ${this.height}`;

          if (this.format !== 'P6') {
            console.error('Unsupported PNM format:', this.format);
            return;
          }

          // Change state
          this.state = App.STATE_HEADER_PARSED;

          // Resize canvas
          this.canvas.width = this.width;
          this.canvas.height = this.height;
          this.imageData = this.context.createImageData(this.canvas.width, this.canvas.height);

          // Keep unparsed binary data for later parsing
          value = value.slice(i + 1);

          // Make sure to break so no further data is added to the header
          break;

        }

      }

    }

    if (this.state == App.STATE_HEADER_PARSED && !done) {

      // Merge buffer content with new data
      const newArray = new Uint8Array(this.buffer.length + value.length);
      newArray.set(this.buffer);
      newArray.set(value, this.buffer.length);
      this.buffer = newArray;

      // Process buffer as image data
      for (let i = 0; i < this.buffer.length - 2; i += 3) {
        if (i + 2 >= this.buffer.length) break;  // Ensure we have a full pixel (3 bytes)
        this.imageData.data[this.position]     = this.buffer[i];    // R
        this.imageData.data[this.position + 1] = this.buffer[i+1];  // G
        this.imageData.data[this.position + 2] = this.buffer[i+2];  // B
        this.imageData.data[this.position + 3] = 255;               // Alpha channel
        this.position += 4;
      }

      //
      this.context.putImageData(this.imageData, 0, 0);

      this.buffer = this.buffer.slice(Math.floor(this.buffer.length / 3) * 3);

    }

    if (done) {
      this.position = 0;
      this.state = App.STATE_DATA_PARSED;
      const date = this.getFormattedDate(new Date());
      const ch = this.channel.toString().padStart(2, "0");
      this.saveCanvasToFile(`CH-${ch} ${date}.png`);
      this.channel = undefined;
    } else {
      setTimeout(this.#processChunk.bind(this), 2);
    }

  }

  getFormattedDate(date) {
    const pad = (number, length = 2) => number.toString().padStart(length, '0');

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1); // getMonth() returns month from 0-11
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());
    const millisecond = pad(date.getMilliseconds(), 3);

    return `${year}-${month}-${day} ${hour}-${minute}-${second}.${millisecond}`;
  }

  async saveCanvasToFile(filename) {

    // Create temporary download link
    const link = document.createElement('a');

    link.setAttribute('download', filename);

    await new Promise(resolve => {

      this.canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.click();
        resolve();
      });

    });

    // Remove temporary link
    link.remove();

  }

}
