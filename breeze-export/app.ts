import * as fs from 'fs';
import yargs from 'yargs';
import got from 'got';
import { CookieJar } from 'tough-cookie';
import { parse, HTMLElement } from 'node-html-parser';
import vCardsJS from 'vcards-js';

type Person = {
	name: string;
	url: string;
};

const start = Date.now();

const { site, username, password, maxFileSize } = yargs(process.argv.slice(2)).options({
	site: { type: 'string', demandOption: true },
	username: { type: 'string', default: '' },
	password: { type: 'string', default: '' },
	maxFileSize: { type: 'number', default: 15 },
}).parseSync()
const maxFileBytes = maxFileSize * 1024 * 1024;

const prefixUrl = 'https://' + site + ".breezechms.com";

const client = got.extend({
	prefixUrl,
	cookieJar: new CookieJar(),
});

main();

async function main() {
	// if (!await login()) {
	// 	throw new Error('could not log in');
	// }
	const people = await getPeople();
	const vcards = await Promise.all(people.map(person => makeVcard(person)));
	const filenames = await writeVcards(vcards);
	console.log(`wrote ${filenames.join(', ')} in ${(Date.now() - start) / 1000} seconds`);
}

async function writeVcards(vcards: string[]) {
	return new Promise<string[]>(resolve => {
		let i = 0;
		let filenames: string[] = [];
		let stream: fs.WriteStream = fs.createWriteStream(`${site}.vcf`, { flags: 'w' });;
		let writtenBytes = 0;
		(function write() {
			for (let ok = true; i < vcards.length && ok; i++) {
				const vcardBuffer = Buffer.from(vcards[i]);
				if (writtenBytes + vcardBuffer.byteLength > maxFileBytes) {
					stream.end();
					const filename = `${site}-${filenames.length}.vcf`;
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

async function makeVcard({ name, url }: Person) {
	const vcard = vCardsJS();

	// name
	const nameComma = name.indexOf(',');
	vcard.firstName = name.substring(nameComma + 2);
	vcard.lastName = name.substring(0, nameComma);

	const personResponse = await client(url);
	const root = parse(personResponse.body);

	const orgDiv = root.querySelectorAll('.user_settings_dropdown_username_description_container div').pop();
	if (orgDiv) {
		const organization = orgDiv.structuredText;
		vcard.organization = organization; // make arg?
	}



	// image
	const img = root.querySelector('img.profile');
	if (img && img.attributes.src.indexOf('/generic/') === -1) {
		const imgData = await client(img.attributes.src, { responseType: 'buffer' });
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
				vcard.gender = valueCell.structuredText[0] === 'M' ? 'M' : 'F';
				break;
			case 'Age':
				const dateElm = valueCell.querySelector('span.birthdate');
				if (dateElm) {
					const date = dateElm.structuredText;
					vcard.birthday = new Date(date);
				}
				break;
			case 'Address': {
				const [street, location] = valueCell.structuredText.split('\n');
				if (location !== 'Sorry, we are unable to map this address.') {
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
	}
	return vcard.getFormattedString() as string;
}

async function login() {
	// referer required or server thinks request is suspicious
	const headers = {
		referer: prefixUrl + '/login',
	};
	//const formData = new FormData()
	// const body = {
	// 	username,
	// 	password,
	// };
	const body = `username=${username}&password=${password}`
	const response = await client.post('ajax/login', { headers, body, throwHttpErrors: false });
	return response.body.toString() === 'true';
}

async function getPeople(): Promise<Person[]> {
	// referer required or server thinks request is suspicious
	const headers = {
		referer: prefixUrl + '/people',
	};
	const response = await client.post('ajax/list_all_people', { headers });
	const root = parse(response.body.toString()) as HTMLElement;
	const peopleLinks = root.querySelectorAll('a.results_person_name');
	return peopleLinks.map(a => ({ name: a.structuredText, url: a.attributes.href }));
}