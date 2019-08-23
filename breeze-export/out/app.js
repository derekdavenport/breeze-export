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
const vCardsJS = require("vcards-js");
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
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(yield login())) {
            throw new Error('could not log in');
        }
        const people = yield getPeople();
        for (const person of people) {
            const vcard = vCardsJS();
            const nameComma = person.name.indexOf(',');
            vcard.firstName = person.name.substring(nameComma + 2);
            vcard.lastName = person.name.substring(0, nameComma);
            vcard.organization = 'Kenwood'; // make arg?
            const personResponse = yield client(person.link);
            const root = node_html_parser_1.parse(personResponse.body);
            const img = root.querySelector('img.profile');
            const imgData = yield client(img.attributes['src'], { encoding: null });
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
        return response.body === 'true';
    });
}
function getPeople() {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield client('/people');
        const root = node_html_parser_1.parse(response.body);
        const peopleLinks = root.querySelectorAll('a.results_person_name');
        return peopleLinks.map(a => ({ name: a.structuredText, link: a.attributes['href'] }));
    });
}
//# sourceMappingURL=app.js.map