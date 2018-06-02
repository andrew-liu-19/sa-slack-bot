import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import morgan from 'morgan';
import botkit from 'botkit';
import dotenv from 'dotenv';
import yelp from 'yelp-fusion';

dotenv.config({ silent: true });

// initialize
const app = express();
const yelpClient = yelp.client(process.env.YELP_API_KEY);

// enable/disable cross origin resource sharing if necessary
app.use(cors());

// enable/disable http request logging
app.use(morgan('dev'));

// enable only if you want templating
app.set('view engine', 'ejs');

// enable only if you want static assets from folder static
app.use(express.static('static'));

// this just allows us to render ejs from the ../app/views directory
app.set('views', path.join(__dirname, '../src/views'));

// enable json message body for posting data to API
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// default index route
app.get('/', (req, res) => {
  res.send('hi');
});

// START THE SERVER
// =============================================================================
let port = process.env.PORT || 9090;
port = parseInt(port, 10) + 1;
app.listen(port);

console.log(`listening on: ${port}`);

// botkit controller
const controller = botkit.slackbot({
  debug: false,
});

// initialize slackbot
const slackbot = controller.spawn({
  token: process.env.SLACK_BOT_TOKEN,
  // this grabs the slack token we exported earlier
}).startRTM((err) => {
  // start the real time message client
  if (err) { throw new Error(err); }
});

// prepare webhook
// for now we won't use this but feel free to look up slack webhooks
controller.setupWebserver(process.env.PORT || 3001, (err, webserver) => {
  controller.createWebhookEndpoints(webserver, slackbot, () => {
    if (err) { throw new Error(err); }
  });
});


// example hello response
controller.hears(['hello', 'hi', 'howdy'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.api.users.info({ user: message.user }, (err, res) => {
    if (res) {
      bot.reply(message, `Hello, ${res.user.name}!`);
    } else {
      bot.reply(message, 'Hello there!');
    }
  });
});

// example hello response
controller.hears(['hungry', 'food', 'restaurant'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.startConversation(message, (err, convo) => {
    convo.ask({
      text: 'Do you want restaurant recommendations near you?',
    }, [
      {
        pattern: bot.utterances.yes,
        callback(reply) {
          convo.ask(
            { text: 'Great! What type of food would you like?' },
            [
              {
                default: true,
                callback(termMessage) {
                  convo.ask({ text: 'Where are you right now? ' }, [
                    {
                      default: true,
                      callback(locationMessage) {
                        yelpClient.search({ term: termMessage.text, location: locationMessage.text }).then((restaurants) => {
                          bot.reply(
                            locationMessage,
                            {
                              text: 'Here is a restaurant in the area',
                              attachments: [
                                {
                                  title: `${restaurants.jsonBody.businesses[0].name}`,
                                  title_link: `${restaurants.jsonBody.businesses[0].url}`,
                                  text: `Rating: ${restaurants.jsonBody.businesses[0].rating} stars`,
                                  image_url: `${restaurants.jsonBody.businesses[0].image_url}`,
                                },
                              ],
                            },
                          );
                          convo.next();
                        }).catch((error) => {
                          bot.reply(locationMessage, 'No restaurants found. Sorry.');
                          convo.next();
                        });
                      },
                    },
                  ]);
                  convo.next();
                },
              },
            ],
          );
          convo.next();
        },
      },
      {
        pattern: bot.utterances.no,
        callback(reply) {
          convo.say('Bad choice.');
          convo.next();
        },
      },
      {
        default: true,
        callback(reply) {
          bot.reply(message, 'Sorry, I do not understand what you are saying.');
        },
      },
    ]);
  });
});

controller.hears('help', ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.reply(message, 'Hi! If you say hi to me, I will say hi back to you. Otherwise, to get a restaurant recommendation, tell me you are hungry!');
});

// catch-all response
controller.hears('^.*', ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.reply(message, 'Sorry, I do not understand what you are saying.');
});

controller.on('outgoing_webhook', (bot, message) => {
  bot.replyPublic(message, 'yeah yeah');
});
