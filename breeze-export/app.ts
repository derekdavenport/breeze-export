import { URL } from 'url';
import { Duplex } from 'stream';
import { argv } from 'yargs';
import * as got from 'got';
import { CookieJar } from 'tough-cookie';
import { parse, HTMLElement } from 'node-html-parser';

// add missing got declarations
declare module 'got' {
	interface MyGotStreamFn extends GotStreamFn {
		(url: GotUrl, options?: GotFormOptions<string | null>): GotEmitter & Duplex;
		(url: GotUrl, options?: GotBodyOptions<string | null>): GotEmitter & Duplex;
	}
	interface GotFn<T extends string | null = string> {
		(url: GotUrl): GotPromise<T extends string ? string : Buffer>;
		(url: GotUrl, options: GotJSONOptions): GotPromise<any>;
		(url: GotUrl, options: GotFormOptions<T>): GotPromise<T extends string ? string : Buffer>;
		(url: GotUrl, options: GotBodyOptions<T>): GotPromise<T extends string ? string : Buffer>;
	}
	interface GotExtend {
		(options: GotBodyOptions<null>): MyGotInstance<null>;
	}

	interface MyGotInstance<T extends string | null> extends GotFn<T>, Record<'get' | 'post' | 'put' | 'patch' | 'head' | 'delete', GotFn<T>> {
		stream: MyGotStreamFn & Record<'get' | 'post' | 'put' | 'patch' | 'head' | 'delete', MyGotStreamFn>;
	}
}

const { site, username, password } = argv;

if (!site || !username || !password) {
	console.error('missing param');
	throw new Error('missing param');
}

const baseUrl = 'https://' + site;
const cookieJar = new CookieJar();

const gotOptions: got.GotBodyOptions<null> = {
	// encoding: null, // default to buffer
	// followRedirect: false,
	baseUrl,
	cookieJar,
};
const client = got.extend(gotOptions);

main();

async function main() {
	if (!await login()) {
		throw new Error('could not log in');
	}
	const people = await getPeople();
	for (const person of people) {
		const personResponse = await client(person.link);
		const personBody = personResponse.body.toString();
		const root = parse(personBody) as HTMLElement;
		const personDetailsTable = root.querySelector('table.person_details');
		const personDetails = personDetailsTable.querySelectorAll('tr').reduce((personDetails, row) => {
			const cells = row.querySelectorAll('td');
			personDetails[cells[0].text.trim()] = cells[1].text.trim();
			return personDetails;
		}, {});
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
	return peopleLinks.map(a => ({ name: a.innerHTML, link: a.attributes['href'] }));
}