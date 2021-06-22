## Earnings Report Scheduler

- [What](#what)
- [Why](#why)
- [How](#how)
- [Running the program](#running-the-program)

![screenshot](/images/home-page-capture.JPG)

### What?

Web app that uses Google Calendar API and Alpha Vantage API to retrieve dates of US companies' quarterly earnings reports and create Google Calendar events/reminders for the user. It is a final project for an Internet and Web Tech class and it focuses on the use of JavaScript callback functions, Node.js's http and https libraries, as well as modern authorization protocols like OAuth 2.0.

### Why?

To help users set reminders of the release of earnings reports from their favorite companies in the US stock market.

### How?

The app uses both synchronous and asynchronous JS to take the user from entering stock ticker data, to signing in to their Google account, to finally adding a reminder to their calendar.

After taking user input, the app's server issues requests to the Alpha Vantage API (a financial data API) asking for data on a set of stock symbols entered by the user; for every symbol with a valid response, the API response is saved on an array and (asynchronously) cached to possibly use later and avoid redundant requests. Once all the data is retrieved, the user is redirected to Google's sign in page and if login is successful, new events on the dates of earnings for the companies entered are added to the user's calendar, if login fails, the user is notified shortly before getting redirected to the home page of the app.

### Running the program

1. Clone the repository

2. Go to the app's folder, open a terminal, and install all modules listed as dependencies in `package.json` by running `npm install` 

3. Enter your credentials for Alpha Vantage API and Google Calendar API (change lines 13-15 on `index.js`)

   - Alpha Vantage uses API key authentication and you can obtain one [`here`](https://www.alphavantage.co/support/#api-key) by providing your email

   - Google Calendar uses OAuth2 so you will need a few more steps to obtain credentials. Please see [`Google's OAuth 2.0 documentation`](https://developers.google.com/identity/protocols/oauth2) for detailed instructions. You will only need a client_id and client_secret

4. Start server by running `node index.js` on a terminal

5. Go to `http://localhost:3000/` using a browser of choice

6. Enjoy!
