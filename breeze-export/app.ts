import { URL } from 'url';
import { Duplex } from 'stream';
import { argv } from 'yargs';
import * as got from 'got';
import { CookieJar } from 'tough-cookie';
import { parse, HTMLElement } from 'node-html-parser';
import * as vCardsJS from 'vcards-js';

const { site, username, password } = argv;

if (!site || !username || !password) {
	console.error('missing param');
	throw new Error('missing param');
}

const baseUrl = 'https://' + site;
const cookieJar = new CookieJar();

const gotOptions = {
	// encoding: null, // default to buffer
	// followRedirect: false,
	baseUrl,
	cookieJar,
};
const client = got.extend(gotOptions);
const vcardKeys = {
	'Mobile': 'cellPhone',
	'Email': 'email',
	'Gender': 'gender',
};
const vcardValues = {
	'Male': 'M',
	'Female': 'F',
};

main();

async function main() {
	if (!await login()) {
		throw new Error('could not log in');
	}
	const people = await getPeople();
	for (const person of people) {
		const vcard = vCardsJS();
		const nameComma = person.name.indexOf(',');
		vcard.firstName = person.name.substring(nameComma + 2);
		vcard.lastName = person.name.substring(0, nameComma);
		vcard.organization = 'Kenwood'; // make arg?
		const personResponse = await client(person.link);
		const root = parse(personResponse.body) as HTMLElement;
		const img = root.querySelector('img.profile');
		const imgData = await client(img.attributes['src'], { encoding: null });
		vcard.photo.embedFromString(imgData.body.toString('base64'), 'image/jpeg');
		const tables = root.querySelectorAll('table.person_details');
		for (const table of tables) {
			for (const row of table.querySelectorAll('tr')) {
				const [key, value] = row.querySelectorAll('td').map(cell => cell.structuredText);
				if (key in vcardKeys) {
					vcard[vcardKeys[key]] = value in vcardValues ? vcardValues[value] : value;
				}
				else if (key === 'Age') {
					const date = row.querySelector('span.birthdate').structuredText;
					vcard.birthday = new Date(date);
				}
				else if (key === 'Address') {
					const [street, location] = value.split('\n');
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
		console.log(vcard.getFormattedString());
		break;
	}
	console.log('done');
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

async function getPeople() {
	const response = await client('/people');
	const root = parse(response.body) as HTMLElement;
	const peopleLinks = root.querySelectorAll('a.results_person_name');
	return peopleLinks.map(a => ({ name: a.structuredText, link: a.attributes['href'] }));
}