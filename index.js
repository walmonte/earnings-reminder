const fs = require("fs");
const url = require("url");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const querystring = require("querystring");
const csv = require('./util_files/csv-json.js')

// fixed, client-side data
// please note that server: third-party app, client: this app, user: end user
// the credentials file only need client_id, client_secret, and apikey, the rest is fixed
const {
    client_id,     // Google Calendar API
    client_secret, // Google Calendar API
    scope,         // Google Calendar API
    apikey,        // AlphaVantage API
    timeZone       // Google Calendar API
} = require("./auth/credentials.json");
let all_sessions = [];

const port = 3000;

const server = http.createServer();

// every request to the server will be handled by the requestHandler callback
server.on("request", requestHandler);

function requestHandler(req, res) {
    console.log(`New Request from ${req.socket.remoteAddress} for ${req.url}`);

    // all the applicable endpoints in the server
    if (req.url === "/") {
        //home
        const form = fs.createReadStream("html/index.html");
        res.writeHead(200, {
            "Content-Type": "text/html"
        })
        form.pipe(res);
    } else if (req.url === "/html/final.html") {
        const form = fs.createReadStream("html/final.html");
        res.writeHead(200, {
            "Content-Type": "text/html"
        })
        form.pipe(res);
    } else if (req.url === "/html/no_data.html") {
        const form = fs.createReadStream("html/no_data.html");
        res.writeHead(200, {
            "Content-Type": "text/html"
        })
        form.pipe(res);
    } else if (req.url === '/favicon.ico') {
        const iconReadStream = fs.createReadStream('images/favicon.ico')
        res.writeHead(200, {
            'Content-Type': 'image/x-icon'
        })
        iconReadStream.pipe(res)
    } else if (req.url.startsWith('/search')) {
        const url = new URL(req.url, 'http://localhost:3000')
        let symbols = [] // for storing user input

        // splitting user input into diferent strings and saving them into array symbols
        symbols = url.searchParams.get('tickers').split(/[ ,0-9~`!@#$%^&*()-+=_;:'"?/\/]+/).filter(Boolean);
        let timeHorizon = url.searchParams.get('horizon')

        if (symbols == null || symbols.length === 0) { // if input is invalid, end the request
            const form = fs.createReadStream("html/no_data.html");
            res.writeHead(200, {
                "Content-Type": "text/html"
            })
            form.pipe(res);
        } else { // if stock ticker input is valid, request earnings dates from AlphaVantage API

            let reports = []
            while (symbols.length > 0) {
                let ticker = symbols.pop()
                let tickersLeft = symbols.length
                const earningsCachePath = `./cache/${ticker.toLowerCase()}-${timeHorizon}month.txt`

                if (fs.existsSync(earningsCachePath)) {
                    console.log(`A chache file for ${ticker}-${timeHorizon}months exists, retreiving report(s) date(s) from chache...`)
                    let data = fs.readFileSync(earningsCachePath, 'utf-8')
                    let cachedReports = JSON.parse(data)
                    let session = all_sessions.find(session => session.reports == cachedReports);
                    if (session != undefined) {
                        redirectToGoogle(session.state, res);
                    } else {
                        reports = cachedReports;
                        const state = crypto.randomBytes(20).toString("hex");
                        all_sessions.push({
                            reports,
                            state
                        });
                        redirectToGoogle(state, res);
                    }

                } else {
                    console.log(`No cache available for ${ticker}-${timeHorizon}months, calling AlphaVantage API...`)
                    gatherEarningsData(reports, ticker, tickersLeft, timeHorizon, res)
                }
            }
        }
    }
    // after google authentication (getting code), send accesstokenRequest (if necessary)
    else if (req.url.startsWith("/?state") || req.url.startsWith("/?code")) {
        const {
            state,
            code
        } = url.parse(req.url, true).query;

        let session = all_sessions.find(session => session.state === state);
        if (code === undefined || state === undefined || session === undefined) {
            res.writeHead(400, {
                "Content-Type": "text/html"
            });
            res.end(`<h2>400 Bad Request(on '/search'): invalid code or state</h2>`);
        } else {

            sendAccessTokenRequest(code, session.reports, res);
        }
    }
    // authentication failed
    else if (req.url === '/?error=access_denied') {

        const form = fs.createReadStream("html/auth_failed.html");
        res.writeHead(403, {
            "Content-Type": "text/html"
        });
        form.pipe(res);
    }
    // all other endpoints
    else {
        res.writeHead(404, {
            "Content-Type": "text/html"
        });
        res.end(`<h2>404 Not Found</h2>`);
    }
}

// gatherEarningsData from the AlphaVantage API
function gatherEarningsData(reports, ticker, tickersLeft, timeHorizon, res) {
    const options = {
        "method": "GET",
        "headers": {
            "Content-Type": "application/x-download"
        }
    }
    const earningsEndpoint = `https://www.alphavantage.co/query`
    const query = querystring.stringify({
        "function": "EARNINGS_CALENDAR",
        "symbol": `${ticker}`,
        "horizon": `${timeHorizon}month`,
        "apikey": `${apikey}`
    });

    const getDataRequest = https.request(`${earningsEndpoint}?${query}`, options)
    getDataRequest.on('error', (err) => {
        console.log(`Error when retrieving data: ${err}`);
        res.writeHead(400, {
            "Content-Type": "text/html"
        });
        res.end(`<h2>400 Bad Request</h2>`);
    }).end()

    getDataRequest.once('response', (dataStream) => processStream(dataStream, receivedData, reports, ticker, tickersLeft, timeHorizon, res));

    getDataRequest.end();
}

// after receving, processing the data, send it as an event on a POST request to the Google CalendarAPI
function receivedData(data, reports, ticker, tickersLeft, timeHorizon, res) {

    const jsonData = csv.toJSON(data)

    jsonData.map((singleReport) => {
        let eps = (singleReport.estimate != '') ? ` (expectedEPS: $` + singleReport.estimate + `)` : ''
        reports.push({
            "ticker": `${ticker}`,
            "timeHorizon": `${timeHorizon}`,
            "data": {
                "summary": `${singleReport.name} | Earnings Report Today${eps}`,
                "start": singleReport.reportDate + 'T09:00:00-04:00',
                "end": singleReport.reportDate + 'T10:00:00-04:00'
            }
        });

    });

    if (tickersLeft == 0) {
        if (reports.length === 0) {
            const form = fs.createReadStream("html/no_data.html");
            res.writeHead(200, {
                "Content-Type": "text/html"
            })
            form.pipe(res);
        } else {

            //console.log('@receivedData(): ', reports, 'length', reports.length);
            console.log("@receivedData() Ok, reports.length;", reports.length);

            const state = crypto.randomBytes(20).toString("hex");
            all_sessions.push({
                reports,
                state
            });
            createReportsCache(reports);
            redirectToGoogle(state, res);
        }
    }
    return;
}

function createReportsCache(reports) {

    let filename = `./cache/${reports[0].ticker.toLowerCase()}-${reports[0].timeHorizon}month.txt`;
    let data = reports.map(el => JSON.stringify(el)).join(',')
    data = '[' + data + ']';

    fs.writeFile(filename, data, function (err) {
        if (err) throw err;
        console.log('earnings date cache created successfully!');
    });

}

function redirectToGoogle(state, res) {
    let authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth'
    const uri = querystring.stringify({
        "client_id": `${client_id}`,
        "scope": `${scope}`,
        "response_type": "code",
        "redirect_uri": "http://localhost:3000",
        "access_type": "online",
        "state": `${state}`
    });
    //console.log(`${authorizationEndpoint}?${uri}`);
    res.writeHead(302, {
        Location: `${authorizationEndpoint}?${uri}`
    })
        .end();

};

// afther google authentication and code retreival, send request for access token
function sendAccessTokenRequest(code, reports, res) {
    const tokenEndpoint = "https://oauth2.googleapis.com/token";
    const post_data = querystring.stringify({
        "grant_type": "authorization_code",
        "client_id": `${client_id}`,
        "client_secret": `${client_secret}`,
        "redirect_uri": "http://localhost:3000",
        "code": `${code}`
    });
    const options = {
        "method": "POST",
        "headers": {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    }

    https.request(tokenEndpoint, options, (tokenStream) => processStream(tokenStream, receivedToken, reports, res)).end(post_data);
};

// function processes http response objects
function processStream(stream, callback, ...args) {
    let body = "";
    stream.on("data", chunk => body += chunk);
    stream.on("end", () => callback(body, ...args));
}

// callback function for the accessToken request; extracts and forwards the access token
function receivedToken(tokenStream, reports, res) {
    console.log("receivedToken() Ok");
    let tokenObject = JSON.parse(tokenStream)

    // extract accessToken from response object
    let accessToken = tokenObject.access_token

    getCalendarID(reports, accessToken, res);
};

// calendarID is needed to insert events, retreive it using accessToken
function getCalendarID(reports, accessToken, res) {
    const options = {
        "method": "GET",
        "headers": {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
        }
    }
    const calendarListEndpoint = `https://www.googleapis.com/calendar/v3/users/me/calendarList`

    const calendarListRequest = https.request(calendarListEndpoint, options)
    calendarListRequest.on('error', errorHandler)

    function errorHandler(err) {
        console.log(`Error when getting calendarID: ${err}`);
        res.writeHead(400, {
            "Content-Type": "text/html"
        });
        res.end(`<h2>400 Bad Request</h2>`);
    }

    calendarListRequest.once('response', (calendarListStream) => processStream(calendarListStream, receivedCalendarList, reports, accessToken, res));
    calendarListRequest.end();
}

// get calendar list, then extract calendarID and call gatherEarningsData 
function receivedCalendarList(calendarListStream, reports, accessToken, res) {
    //console.log("reports:", reports);

    let calendarListObject = JSON.parse(calendarListStream)

    let calendarID = calendarListObject.items[0].id

    generateCalendarEvent(reports, accessToken, calendarID, res);
};


// inserts an event to the user's calendar
function generateCalendarEvent(reports, accessToken, calendarID, res) {
    const eventsEndpoint = `https://www.googleapis.com/calendar/v3/calendars/${calendarID}/events`

    const options = {
        "method": "POST",
        "headers": {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
        }
    }

    let eventsAddedCount = 0;
    reports.forEach((myReport) => createEvent(myReport.data));

    function createEvent(data) {

        const post_data = JSON.stringify({
            "summary": `${data.summary}`,
            "status": "confirmed",
            "colorId": "5",
            "start": {
                'dateTime': `${data.start}`,
                'timeZone': `${timeZone}`,
            },
            "end": {
                "dateTime": `${data.end}`,
                "timeZone": `${timeZone}`,
            }
        });
        const insertEventRequest = https.request(eventsEndpoint, options);

        insertEventRequest.on("error", (err) => {
            console.log(`Error when inserting event: ${err}`);
            res.writeHead(400, {
                "Content-Type": "text/html"
            });
            res.end(`<h2>400 Bad Request</h2>`);
        });
        insertEventRequest.on("response", (eventStream) => processStream(eventStream, receivedEventResponse, res)).end(post_data);
    }

    function receivedEventResponse(body, res) {
        eventsAddedCount++;
        if (eventsAddedCount === reports.length) {

            all_sessions = all_sessions.filter(session => session.reports != reports)

            reports = []

            console.log('All events have been added to the calendar')
            const form = fs.createReadStream("html/final.html");
            res.writeHead(200, {
                "Content-Type": "text/html"
            })
            form.pipe(res);
        }
    }
}

server.on("listening", listen_handler);

function listen_handler() {
    console.log(`Now Listening on Port ${port}`);
    console.log(server.address());
}

server.listen(port);