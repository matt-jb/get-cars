/////////////////////////////////////////////////////////////
// Boilerplate code

const express = require("express");
const https = require("https");
const bodyParser = require("body-parser");
const mongoose = require('mongoose');
const Car = require('./models/Car.js');
const fs = require("fs");
// const { generateKeyPair } = require("crypto");

const prompt = require('prompt-sync')();

require('dotenv').config({
    path: './variables.env'
});

const app = express();
app.use(bodyParser.urlencoded({
    extended: true
}));

module.exports = app;

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'; // Not secure, might resolve later.

function wait(ms = 0) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    })
}

function handleError(err) {
    console.log("There was an error:");
    console.log(err);
}

async function dbConnection(state = true) {
    if (state) {
        try {
            mongoose.connect(
                process.env.DATABASE, {
                    useNewUrlParser: true,
                    useUnifiedTopology: true,
                    useFindAndModify: false
                },
                () => console.log("Mongoose is connected")
            );

        } catch (err) {
            console.log("Could not connect. Reason: " + err);
        }
    } else {
        mongoose.connection.close()
    }
}

let generatedURLs = []

/////////////////////////////////////////////////////////////
// Datasets needed for server queries

const carBrandsMined = ['AUDI', 'BMW', 'CITROEN', 'DACIA',
    'FIAT', 'FORD', 'HONDA', 'HYUNDAI', 'INFINITI', 'KIA',
    'LEXUS', 'MAZDA', 'MERCEDES-BENZ', 'NISSAN', 'OPEL',
    'PEUGEOT', 'RENAULT', 'SEAT', 'SKODA', 'SUBARU',
    'SUZUKI', 'TOYOTA', 'VOLKSWAGEN', 'VOLVO']

const wojewodztwaCodesMined = ['02', // DOLNOŚLĄSKIE
    '04', // KUJAWSKO-POMORSKIE
    '06', // LUBELSKIE
    '08', // LUBUSKIE
    '10', // ŁÓDZKIE
    '12', // MAŁOPOLSKIE
    '14', // MAZOWIECKIE
    '16', // OPOLSKIE
    '18', // PODKARPACKIE
    '20', // PODLASKIE
    '22', // POMORSKIE
    '24', // ŚLĄSKIE
    '26', // ŚWIĘTOKRZYSKIE
    '28', // WARMIŃSKO-MAZURSKIE
    '30', // WIELKOPOLSKIE
    '32' // ZACHODNIOPOMORSKIE
]

// By trial and error a month seems to be the optimal length for a single query

let datesFromMined = [`0101`, `0201`, `0301`, `0401`, `0501`, `0601`, `0701`, `0801`, `0901`, `1001`, `1101`, `1201`]
let datesToMined = [`0131`, `0228`, `0331`, `0430`, `0531`, `0630`, `0731`, `0831`, `0930`, `1031`, `1130`, `1231`]

let year = ``
let param1 = ''
let param2 = ''
let param3 = ''
let param4 = ''
let url = `https://api.cepik.gov.pl/pojazdy?wojewodztwo=${param1}&data-od=${year}${param2}&data-do=${year}${param3}&limit=500&filter[rodzaj-pojazdu]=SAMOCH%C3%93D%20OSOBOWY&filter[marka]=${param4}`

// The callback hell doesn't look very nice, but does the job well enough

function generateURLs() {
    carBrandsMined.forEach(attachBrand);

    function attachBrand(brand) {
        param4 = brand;
        url = `https://api.cepik.gov.pl/pojazdy?wojewodztwo=${param1}&data-od=${year}${param2}&data-do=${year}${param3}&limit=500&filter[rodzaj-pojazdu]=SAMOCH%C3%93D%20OSOBOWY&filter[marka]=${param4}`

        datesFromMined.forEach(attachDates);

        function attachDates(singleDateFrom, index) {
            param2 = singleDateFrom;
            param3 = datesToMined[index];
            url = `https://api.cepik.gov.pl/pojazdy?wojewodztwo=${param1}&data-od=${year}${param2}&data-do=${year}${param3}&limit=500&filter[rodzaj-pojazdu]=SAMOCH%C3%93D%20OSOBOWY&filter[marka]=${param4}`
            wojewodztwaCodesMined.forEach(attachWojewodztwo);

            function attachWojewodztwo(singleWojewodztwo) {
                param1 = singleWojewodztwo;
                url = `https://api.cepik.gov.pl/pojazdy?wojewodztwo=${param1}&data-od=${year}${param2}&data-do=${year}${param3}&limit=500&filter[rodzaj-pojazdu]=SAMOCH%C3%93D%20OSOBOWY&filter[marka]=${param4}`

                generatedURLs.push(url);
            }
        }
    }
}

async function getData() {
    for (i = 0; i < generatedURLs.length; i++) {
        await wait(750); // Again, this number of ms was reached by trial and error

        https.get(generatedURLs[i], async (response) => {
            var body = '';

            response.on("data", async (data) => {
                body += data;
            });
            response.on("end", async (data) => {
                const carData = await JSON.parse(body)
                if (carData.hasOwnProperty('errors')) {
                    await writeToLogFile(`'${generatedURLs[i]}'\n${JSON.stringify(carData)}`, null, './log-failure.txt');
                } else {
                    const singleCarBrand = generatedURLs[i].split('[marka]=')[1]
                    if (!carData.meta.count) {
                        await writeToLogFile(`'${generatedURLs[i]}' - 0`, singleCarBrand, './log-success.txt');
                    }
                    else if (carData.meta.count === 501) {
                        await writeToLogFile(`'${generatedURLs[i]}' - 501`, singleCarBrand, './log-failure.txt'); // 501 is just the number that CEPiK sometimes serves the client when the number of cars is >501, so it needs to be stored for future re-mining
                    } 
                    else {
                        await addCar(singleCarBrand, carData.meta.count);
                        await writeToLogFile(generatedURLs[i], singleCarBrand, './log-success.txt');
                    }
                }
            });
        });
        await wait(750);
    }
}

async function addCar(brand, count) {
    const brandToUpdate = brand
    const countToUpdate = count
    const carThatIsBeingUpdated = await Car.findOneAndUpdate({
        brand: brandToUpdate
    }, {
        $inc: {
            numberOfCars: countToUpdate
        }
    }, {
        new: true
    }).exec();

    console.log(`Successfully updated brand: ${brandToUpdate} with the count of: ${countToUpdate} cars.`);
}

async function writeToLogFile(content, brand, file = './log-failure.txt') {
    fs.appendFile(file, `${content}\n`, function (err) {
        if (err) throw err;
        if (file === './log-failure.txt') {
            console.log(`Added URL for brand: ${brand} to the failure log file for later re-usage.`);
        } else if (file === './log-success.txt') {
            console.log(`${brand} confirmed for this query.`);
        } else {
            console.log(`Probably added something weird to the log file. Make sure to debug.`);
        }
    });
}

async function getYear() {
    const yearFromUser = prompt('Enter year to mine: ');
    year = yearFromUser;
}

async function go() {
    await getYear();
    await generateURLs();
    await dbConnection(true);
    await getData();
    await dbConnection(false);
};

go().then().catch(handleError);