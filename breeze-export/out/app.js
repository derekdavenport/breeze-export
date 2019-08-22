"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const yargs_1 = require("yargs");
const got = require("got");
const tough_cookie_1 = require("tough-cookie");
const node_html_parser_1 = require("node-html-parser");
const { site, username, password } = yargs_1.argv;
if (!site || !username || !password) {
    console.error('missing param');
    throw new Error('missing param');
}
const baseUrl = 'https://' + site;
const cookieJar = new tough_cookie_1.CookieJar();
const gotOptions = {
    // encoding: null, // default to buffer
    // followRedirect: false,
    baseUrl,
    cookieJar,
};
const client = got.extend(gotOptions);
main();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(yield login())) {
            throw new Error('could not log in');
        }
        const people = yield getPeople();
        for (const person of people) {
            const personResponse = yield client(person.link);
            const personBody = personResponse.body.toString();
            const root = node_html_parser_1.parse(personBody);
            const personDetailsTable = root.querySelector('table.person_details');
            const personDetails = personDetailsTable.querySelectorAll('tr').reduce((personDetails, row) => {
                const cells = row.querySelectorAll('td');
                personDetails[cells[0].text.trim()] = cells[1].text.trim();
                return personDetails;
            }, {});
            break;
        }
        console.log('done');
    });
}
function login() {
    return __awaiter(this, void 0, void 0, function* () {
        // referer required or server thinks request is suspicious
        const headers = {
            referer: baseUrl + '/login',
        };
        const body = {
            username,
            password,
        };
        const response = yield client.post('/ajax/login', { headers, form: true, body, throwHttpErrors: false });
        // const text = response.body.toString();
        // const homeResponse = await client('/');
        // const dashResponse = await client('/dashboard');
        return response.body === 'true';
    });
}
function getPeople() {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield client('/people');
        const root = node_html_parser_1.parse(response.body);
        const peopleLinks = root.querySelectorAll('a.results_person_name');
        return peopleLinks.map(a => ({ name: a.innerHTML, link: a.attributes['href'] }));
    });
}
//# sourceMappingURL=app.js.map