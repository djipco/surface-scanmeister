const {spawn} = require('child_process');

const device = 'genesys:libusb:001:007';
const filename = '../scans/' + device.replaceAll(":", "-") + ".png";

const scanimage = spawn(
	'scanimage', 
	[
		`--device-name=${device}`,
		'--format=png',
		'--mode=Color',
		'--depth=8',
		'--resolution=75',
		`--output-file=${filename}`
	]
);

//ls.stdout.on( 'data', ( data ) => {
//    console.log( `stdout: ${ data }` );
//} );

scanimage.stderr.on( 'data', ( data ) => {
    console.error( `stderr: ${ data }` );
} );

scanimage.on( 'close', ( code ) => {
	console.log( `child process exited with code ${ code }` );
});
