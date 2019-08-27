import { URL } from 'url';
import { Duplex } from 'stream';
import * as fs from 'fs';
import { argv } from 'yargs';
import * as got from 'got';
import { CookieJar } from 'tough-cookie';
import { parse, HTMLElement } from 'node-html-parser';
import * as vCardsJS from 'vcards-js';

type Person = {
	name: string;
	url: string;
}

const { site, username, password, maxFileSize } = argv;
const maxFileBytes = (parseInt(maxFileSize) || 15) * 1024 * 1024;

if (!site || !username || !password) {
	console.error('missing param');
	throw new Error('missing param');
}

const baseUrl = 'https://' + site;
const cookieJar = new CookieJar();

const client = got.extend({
	// encoding: null, // default to buffer
	// followRedirect: false,
	baseUrl,
	cookieJar,
});


main();

async function main() {
	if (!await login()) {
		throw new Error('could not log in');
	}
	const people = await getPeople();
	const vcardPromises: Promise<string>[] = [];
	let i = 0;
	for (const person of people) {
		vcardPromises.push(makeVcard(person));
		if (i++ > 1) {
			break;
		}
	}
	const vcards = await Promise.all(vcardPromises);
	const filenames = await writeVcards(vcards);
	console.log('wrote ' + filenames.join(', '));
}

async function writeVcards(vcards: string[]) {
	return new Promise<string[]>(resolve => {
		let i = 0;
		let filenames: string[] = [];
		let stream: fs.WriteStream;
		let writtenBytes = 0;
		const results = (function write() {
			for (let ok = true; i < vcards.length && ok; i++) {
				const vcardBuffer = Buffer.from(vcards[i]);
				if (!stream || writtenBytes + vcardBuffer.byteLength > maxFileBytes) {
					if (stream) {
						stream.end();
					}
					const filename = `breeze-vcards-${filenames.length}.vcf`;
					filenames.push(filename);
					stream = fs.createWriteStream(filename, { flags: 'w' });
					writtenBytes = 0;
				}
				ok = stream.write(vcardBuffer);
				writtenBytes += vcardBuffer.byteLength;
			}
			if (i < vcards.length) {
				stream.once('drain', write);
			}
			else {
				stream.end();
				resolve(filenames);
			}
		})();
	});
}

async function makeVcard({ name, url }) {
	const vcard = vCardsJS();
	vcard.organization = 'Kenwood'; // make arg?

	// name
	const nameComma = name.indexOf(',');
	vcard.firstName = name.substring(nameComma + 2);
	vcard.lastName = name.substring(0, nameComma);

	const personResponse = await client(url);
	const root = parse(personResponse.body) as HTMLElement;

	// image
	const img = root.querySelector('img.profile');
	if (img.attributes.src !== 'https://files.breezechms.com/img/profiles/generic/gray.png') {
		const imgData = await client(img.attributes['src'], { encoding: null });
		vcard.photo.embedFromString(imgData.body.toString('base64'), 'image/jpeg');
	}

	// everything else
	for (const row of root.querySelectorAll('table.person_details tr')) {
		const [keyCell, valueCell] = row.querySelectorAll('td');
		switch (keyCell.structuredText) {
			case 'Email':
				vcard.email = valueCell.structuredText;
				break;
			case 'Mobile':
				vcard.cellPhone = valueCell.structuredText;
				break;
			case 'Gender':
				vcard.gender = valueCell.structuredText[0];
				break;
			case 'Age':
				const date = valueCell.querySelector('span.birthdate').structuredText;
				vcard.birthday = new Date(date);
				break;
			case 'Address': {
				const [street, location] = valueCell.structuredText.split('\n');
				const locationComma = location.indexOf(',');
				const city = location.substring(0, locationComma);
				const stateProvince = location.substr(locationComma + 2, 2);
				const postalCode = location.substring(locationComma + 5);
				vcard.homeAddress.label = 'Home Address';
				vcard.homeAddress.street = street;
				vcard.homeAddress.city = city;
				vcard.homeAddress.stateProvince = stateProvince;
				vcard.homeAddress.postalCode = postalCode;
			}
		}
	}
	return vcard.getFormattedString() as string;
}

async function login() {
	// referer required or server thinks request is suspicious
	const headers = {
		referer: baseUrl + '/login',
	};
	const body = {
		username,
		password,
	};
	const response = await client.post('/ajax/login', { headers, form: true, body, throwHttpErrors: false });
	return response.body === 'true';
}

async function getPeople(): Promise<Person[]> {
	const response = await client('/people');
	const root = parse(response.body) as HTMLElement;
	const peopleLinks = root.querySelectorAll('a.results_person_name');
	return peopleLinks.map(a => ({ name: a.structuredText, url: a.attributes['href'] }));
}