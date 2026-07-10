# INITIAL CONFIGURATION

### Installing the Operating System

Install Raspberry Pi OS (Debian 12, "bookworm"):

* Use **Raspberry Pi Imager.app** to create brand new SDHC boot medium. During the
  process click on "Modify Settings":
  
  * Host: **scanmeister0x** (change "x" by integer)
  * User account: **scanmeister**
  * Password: use a 6-character random password (write it on device)

* Boot Pi from the SDHC card and connect to network

* Go to Pi config:
  
  * Enable **VNC** and **SSH** (in "Interfaces" section)
  * Set timezone (in "Localisation" section)
    
* Update everything:

  ```sh
  sudo apt update
  sudo apt upgrade -y
  ```

### Installing Node.js

First, add the source for Node's latest LTS version:

```sh
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
```

Install Node.js:

```sh
sudo apt install -y nodejs
```

### Installing ScanMeister

#### Installation

To install `scanmeister`, open a terminal, go to desktop and clone from GitHub repo:

```sh
cd ~/Desktop
git clone https://github.com/djipco/surface-scanmeister
```

Go inside folder and install all modules:

```sh
cd surface-scanmeister
npm install
```

#### Server Daemon

The ScanMeister server is meant to run in the background as a `systemd` service. The repository
contains the service definition in `system/scanmeister.service`.

The service file is configured to run as the `scanmeister` user and group:

```ini
User=scanmeister
Group=scanmeister
WorkingDirectory=/home/scanmeister/Desktop/surface-scanmeister
```

Create the user if it does not already exist:

```sh
id scanmeister || sudo useradd -m -s /bin/bash scanmeister
```

Then add it to the groups needed to access scanners and hardware devices:

```sh
sudo usermod -aG scanner,lp,plugdev,video,render,input,i2c,gpio,spi,dialout scanmeister
```

You can verify the result with:

```sh
id scanmeister
groups scanmeister
```

If the `scanmeister` account is currently logged in, log out and back in before relying on the new
group memberships.

Copy it to the system services folder on the Raspberry Pi:

```sh
sudo cp system/scanmeister.service /etc/systemd/system/scanmeister.service
```

Then tell `systemd` to reload its service definitions:

```sh
sudo systemctl daemon-reload
```

Enable the service so it starts automatically when the Pi boots:

```sh
sudo systemctl enable scanmeister.service
```

Start or stop the server manually with:

```sh
sudo systemctl start scanmeister.service
sudo systemctl stop scanmeister.service
```

Restart the server after changing the configuration:

```sh
sudo systemctl restart scanmeister.service
```

Check whether the server is running properly and view recent messages:

```sh
sudo systemctl status scanmeister.service
```

To stop ScanMeister from starting automatically on boot:

```sh
sudo systemctl disable scanmeister.service
```

This matters for logs, saved scans, and permissions. The `logs` and `scans` folders must be
writable by the `scanmeister` user.

#### Client Launcher

The graphical client is opened separately from the server. Use the `ScanMeister Client.desktop`
launcher in the project folder. It opens Chromium in kiosk mode and points it to the local web
client:

```sh
http://localhost:8080?kiosk=1
```

The `kiosk=1` parameter tells the client to use kiosk-specific behavior. To override the regular UI
initial visibility, add `ui=0` or `ui=1`. To show the Guerilla panel, add `guerilla=1`:

```sh
http://localhost:8080?kiosk=1&ui=0
http://localhost:8080?kiosk=1&ui=1
http://localhost:8080?kiosk=1&guerilla=1
http://localhost:8080?kiosk=1&ui=0&guerilla=1
```

When `ui=0`, the Parameters panel, top strip, bottom command strip, and Stats panel are initially hidden.
When `ui=0&guerilla=1`, only the Guerilla panel is shown. When `ui=1`, the regular UI is shown,
but the Guerilla panel is still shown only if `guerilla=1` is present.
In Guerilla mode, moving the mouse does not reveal the regular UI. Press `P` to toggle it manually.

To open the client automatically when the `scanmeister` desktop session starts, add the launcher to
the user's autostart folder:

```sh
mkdir -p ~/.config/autostart
ln -sf "/home/scanmeister/Desktop/surface-scanmeister/ScanMeister Client.desktop" \
       ~/.config/autostart/scanmeister-client.desktop
chmod +x "/home/scanmeister/Desktop/surface-scanmeister/ScanMeister Client.desktop"
```

Verify that the autostart entry exists:

```sh
ls -l ~/.config/autostart/scanmeister-client.desktop
```

After rebooting, the server should start through `systemd`, then Chromium should open the client
when the `scanmeister` user session starts.

To confirm the server side before rebooting:

```sh
sudo systemctl is-enabled scanmeister.service
sudo systemctl status scanmeister.service
```

The expected result is that the service is `enabled` and `active (running)`.

#### Configuration

By default, the **HTTP API** of ScanMeister listens on port **`5678`**, the **HTTP file** server
listens on port **`8080`** and the **OSC server** listens on port **`8000`**. 

Local browser access to the web client is allowed without a password when connecting from
`localhost`, `127.0.0.1`, or `::1`. Remote access to the web client requires HTTP Basic Auth.

##### Web Client Remote Users

The ScanMeister service loads optional authentication settings from:

```text
/etc/scanmeister/scanmeister.env
```

This file is referenced by `system/scanmeister.service` with:

```ini
EnvironmentFile=-/etc/scanmeister/scanmeister.env
```

The leading `-` means the service can still start if the file does not exist. When the file is
missing, local web client access still works, but remote web client access is refused.

The env file can point to the remote users file:

```sh
SCANMEISTER_AUTH_USERS_FILE=/etc/scanmeister/users
```

If `SCANMEISTER_AUTH_USERS_FILE` is omitted, ScanMeister uses `/etc/scanmeister/users`.

The users file contains one user per line:

```text
username:scrypt:salt:hash
```

Passwords are not stored in clear text. Each line stores a `scrypt` password hash.

Create the configuration directory:

```sh
sudo mkdir -p /etc/scanmeister
```

Generate a password hash:

```sh
node -e 'const {randomBytes,scryptSync}=require("node:crypto"); const user=process.argv[1]; const password=process.argv[2]; const salt=randomBytes(16).toString("hex"); const hash=scryptSync(password,salt,64).toString("hex"); console.log(`${user}:scrypt:${salt}:${hash}`);' 'admin' 'your-password'
```

Create `/etc/scanmeister/users`:

```sh
sudo nano /etc/scanmeister/users
```

Add one generated line per remote user:

```text
admin:scrypt:PASTE_GENERATED_SALT:PASTE_GENERATED_HASH
operator:scrypt:PASTE_GENERATED_SALT:PASTE_GENERATED_HASH
```

Then secure the users file:

```sh
sudo chown root:scanmeister /etc/scanmeister/users
sudo chmod 640 /etc/scanmeister/users
```

If you want to use a different users file path, create `/etc/scanmeister/scanmeister.env`:

```sh
sudo nano /etc/scanmeister/scanmeister.env
```

With:

```sh
SCANMEISTER_AUTH_USERS_FILE=/path/to/users
```

Changes to `/etc/scanmeister/users` are picked up automatically. You do not need to restart
ScanMeister after adding, removing, or changing a user in that file.

Restart the service only after changing `/etc/scanmeister/scanmeister.env`, such as when changing
`SCANMEISTER_AUTH_USERS_FILE`:

```sh
sudo systemctl restart scanmeister.service
```

If the users file is missing, unreadable, or contains no valid users, local access still works, but
remote web client access is refused.

To change the IP address and port of the machine OSC messages are sent to, you can modify the 
configuration file:

  ```surface-scanmeister/config/config.js```

This same file can be modified to specify which port the OSC server listens on (by default, 
`8000`). The IP address of the machine OSC messages are sent to should be changed.

The configuration file can also be used to specify the mapping to use for various hubs and
scanner configuration. The `devices.mapping` parameter is used for that and points to one 
of the configuration from the `surface-scanmeister/config/ScannerMappings.js` file.

To reload the configuration file, simply stop and start the `scanmeister` service:

```sh
sudo systemctl stop scanmeister.service
sudo systemctl start scanmeister.service
```

#### Manual Server Launch

Normally, the server should be controlled through `systemctl`. For development only, it can still be
started manually from inside the `surface-scanmeister` directory:

```sh
npm start
```

This is equivalent to:

```sh
node ScanMeister.js
```

# Remote Access

* **VNC**: use `scanmeister` (username) and the password defined above.

* **ssh**: `ssh@IP_ADDRESS` (with same user and pass)

# OSC Schema

On startup and shutdown, the system sends this OSC message:

* `/system/status i 0 (or 1)`

The status of scanners is also broadcasted as:

* `/device/x/scanning` i 0 (or 1)

The browser client can receive the same outbound OSC information over Server-Sent Events by
connecting to the API server's `/events` endpoint:

```js
const events = new EventSource("http://localhost:5678/events");

events.addEventListener("osc", event => {
  const message = JSON.parse(event.data);
  console.log(message.address, message.args);
});
```

Each event contains the OSC address and argument metadata:

```json
{
  "address": "/system/status",
  "args": [{"type": "i", "value": 1}]
}
```

# Testing the scanning environment

#### scanimage

The `scanimage` command is what is used under the hood to control the scanners. 
You can user is to list available devices:

```sh
scanimage --list-devices
```

Results:

```
device `genesys:libusb:001:009' is a Canon LiDE 210 flatbed scanner
device `genesys:libusb:001:008' is a Canon LiDE 210 flatbed scanner
```

or

```sh
scanimage -L
```

There is a [list of supported scanners](http://www.sane-project.org/sane-mfgs.html#SCANNERS) on the 
SANE website.

If, for whatever reason, `scanimage` is not installed (it should already be installed, you need to
install SANE:

```sh
sudo apt install sane
```

#### Retrieve options for device (the options vary from device to device)

```sh
scanimage --device-name='genesys:libusb:001:008' --help 
```

or

```sh
scanimage --device-name='genesys:libusb:001:008' --all-options
```

Result:

```
Options specific to device 'genesys:libusb:001:008':
  Scan Mode:
    --mode Color|Gray [Gray]
        Selects the scan mode (e.g., lineart, monochrome, or color).
    --source Flatbed [Flatbed]
        Selects the scan source (such as a document-feeder).
    --preview[=(yes|no)] [no]
        Request a preview-quality scan.
    --depth 16|8 [8]
        Number of bits per sample, typical values are 1 for "line-art" and 8
        for multibit scans.
    --resolution 4800|2400|1200|600|300|150|100|75dpi [75]
        Sets the resolution of the scanned image.
  Geometry:
    -l 0..216.7mm [0]
        Top-left x position of scan area.
    -t 0..297.5mm [0]
        Top-left y position of scan area.
    -x 0..216.7mm [216.7]
        Width of scan-area.
    -y 0..297.5mm [297.5]
        Height of scan-area.
  Enhancement:
    --custom-gamma[=(yes|no)] [no]
        Determines whether a builtin or a custom gamma-table should be used.
    --gamma-table 0..65535,... [inactive]
        Gamma-correction table.  In color mode this option equally affects the
        red, green, and blue channels simultaneously (i.e., it is an intensity
        gamma table).
    --red-gamma-table 0..65535,... [inactive]
        Gamma-correction table for the red band.
    --green-gamma-table 0..65535,... [inactive]
        Gamma-correction table for the green band.
    --blue-gamma-table 0..65535,... [inactive]
        Gamma-correction table for the blue band.
    --brightness -100..100 (in steps of 1) [0]
        Controls the brightness of the acquired image.
    --contrast -100..100 (in steps of 1) [0]
        Controls the contrast of the acquired image.
  Extras:
    --lamp-off-time 0..60 [15]
        The lamp will be turned off after the given time (in minutes). A value
        of 0 means, that the lamp won't be turned off.
    --lamp-off-scan[=(yes|no)] [no]
        The lamp will be turned off during scan. 
    --color-filter Red|Green|Blue [Green]
        When using gray or lineart this option selects the used color.
    --calibration-file <string> []
        Specify the calibration file to use
    --expiration-time -1..30000 (in steps of 1) [60]
        Time (in minutes) before a cached calibration expires. A value of 0
        means cache is not used. A negative value means cache never expires.
```

#### Debugging

You can debug scanimage by prepending the command with environment variables:

```
SANE_DEBUG_DLL=255
SANE_DEBUG_HPAIO=255
SANE_DEBUG_SANEI_TCP=255
```

For example:

```
SANE_DEBUG_DLL=255 scanimage --device-name=genesys:libusb:001:072 --format=png --mode=Color --output-file=test.png
```

More details on debugging here: https://docs.fedoraproject.org/en-US/quick-docs/cups-debug-scanning-issues/


#### Perform a manual scan

This will save the file on the disk as `image.png`

```sh
scanimage \
  --device-name='genesys:libusb:001:008' \
  --format=png \
  --mode=Color \
  --depth=8 \
  --resolution=100 \
  --brightness=0 \
  --contrast=0 \
  --lamp-off-scan=no \
  --output-file='image.png'
```

#### Send data to TD over TCP

To quickly test the system, it is possible to pipe the output of `scanimage` into `nc` in order to 
send it to TouchDesigner over a TCP connection:

```scanimage --format=pnm --mode=Color | nc -q 0 10.0.0.200 1234```

In this scenario, the image will appear in TD in the `image0` component. The format **must be** `pnm` and 
the mode **must be** `Color`. This yiels a PNM in the P6 format.

    Warning: you may have to isntall netcat. On Debian "Bookworm" (12), I had to use: `sudo apt install netcat-traditional`

The **scanmeister** daemon running on the Pi does the same thing behind the scene. To identify which
device the image is coming from, **scanmeister** adds a comment on the first line of the output. This
is why images sent by **scanmeister** are properly indexed from 1 to 16 (matching the channel).

## USB Devices & USB Physical Ports

USB devices are listed in `/dev/bus/usb`. You can also list them with:

```shell
lsusb
```

Hierachical view (tree view):

```shell
lsusb -t
```

`scanimage` does not provide physical port information. This information can be fetched with 
`usb-devices` (also installed by default). This is what the code uses to figure which device is on 
which port:

```
usb-devices
```
