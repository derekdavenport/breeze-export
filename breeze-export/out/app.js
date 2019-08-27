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
const fs = require("fs");
const yargs_1 = require("yargs");
const got = require("got");
const tough_cookie_1 = require("tough-cookie");
const node_html_parser_1 = require("node-html-parser");
const vCardsJS = require("vcards-js");
const { site, username, password, maxFileSize } = yargs_1.argv;
const maxFileBytes = (parseInt(maxFileSize) || 15) * 1024 * 1024;
if (!site || !username || !password) {
    console.error('missing param');
    throw new Error('missing param');
}
const baseUrl = 'https://' + site;
const cookieJar = new tough_cookie_1.CookieJar();
const client = got.extend({
    // encoding: null, // default to buffer
    // followRedirect: false,
    baseUrl,
    cookieJar,
});
main();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(yield login())) {
            throw new Error('could not log in');
        }
        const people = yield getPeople();
        const vcardPromises = [];
        let i = 0;
        for (const person of people) {
            vcardPromises.push(makeVcard(person));
            if (i++ > 1) {
                break;
            }
        }
        const vcards = yield Promise.all(vcardPromises);
        const filenames = yield writeVcards(vcards);
        console.log('wrote ' + filenames.join(', '));
    });
}
function writeVcards(vcards) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise(resolve => {
            let i = 0;
            let filenames = [];
            let stream;
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
    });
}
function makeVcard({ name, url }) {
    return __awaiter(this, void 0, void 0, function* () {
        const vcard = vCardsJS();
        vcard.organization = 'Kenwood'; // make arg?
        // name
        const nameComma = name.indexOf(',');
        vcard.firstName = name.substring(nameComma + 2);
        vcard.lastName = name.substring(0, nameComma);
        const personResponse = yield client(url);
        const root = node_html_parser_1.parse(personResponse.body);
        // image
        const img = root.querySelector('img.profile');
        if (img.attributes.src !== 'https://files.breezechms.com/img/profiles/generic/gray.png') {
            const imgData = yield client(img.attributes['src'], { encoding: null });
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
        return vcard.getFormattedString();
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
        return peopleLinks.map(a => ({ name: a.structuredText, url: a.attributes['href'] }));
    });
}
//# sourceMappingURL=app.js.map