const { TwitterApi } = require('twitter-api-v2');
const Parse = require('parse/node');
const { JSDOM } = require('jsdom');
const HtmlParser = require('node-html-parser');

const _tweetIncrementally = async (tweets) => {
    const twitterClient = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_API_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });

    for (const tweet of tweets) {
      await _sleep(1000);
      await twitterClient.v2.tweet(tweet);
    }
};

const _sleep = (milliSeconds) => {
  return new Promise(resolve => setTimeout(resolve, milliSeconds));
};

const _getFreshMatchroomFighters = async () => {
  try {
    const dom = await JSDOM.fromURL('https://www.matchroomboxing.com/boxers-2/');
    const root = HtmlParser.parse(dom.serialize());
    return root.querySelectorAll('h2[data-text]').map(element => {
        return element.textContent.trim().replace(/\s\s+/g, ' ');
    }).sort();
  } catch (error) {
    console.error(error);
  }
};

const _getFreshFrankWarrenFighters = async () => {
  try {
    const dom = await JSDOM.fromURL('https://www.frankwarren.com/fighters_cat/fighters/');
    const root = HtmlParser.parse(dom.serialize());
    return root.querySelectorAll('.d-lg-flex.justify-content-between.mb-2.mb-lg-4').map(element => {
        return element.querySelectorAll('h3')[0].textContent.trim();
    }).sort();
  } catch (error) {
    console.error(error);
  }
};

const _getStoredFightersFor = async (promoter) => {
  const Fighters = Parse.Object.extend('Fighters');
  const query = new Parse.Query(Fighters);

  query.equalTo('promoter', promoter);
  query.ascending('full_name');

  const results = await query.find();
  return results.map(result => {
    return result.get('full_name');
  });
};

const _addFighter = async (fullName, promoter) => {
  const Fighters = Parse.Object.extend("Fighters");
  const fighters = new Fighters();

  fighters.set("full_name", fullName);
  fighters.set("promoter", promoter);
  
  await fighters.save();
};

const _removeFighter = async (fullName, promoter) => {
  const Fighters = Parse.Object.extend('Fighters');
  const query = new Parse.Query(Fighters);

  query.equalTo('promoter', promoter);
  query.equalTo('full_name', fullName);

  const results = await query.find();
  results.forEach(async result => {
    await result.destroy();
  });
};

const _getFighterTweets = async (
  freshFighters,
  promoterKey,
  promoterDescription
) => {
  const tweets = [];
  if (freshFighters?.length > 0) {
    const storedFighters = await _getStoredFightersFor(promoterKey);

    for (const storedFighter of storedFighters) {
      const fighterRemoved = !freshFighters.includes(storedFighter);
      if (fighterRemoved) {
        await _removeFighter(storedFighter, promoterKey);
        tweets.push(`🥊 ❌ Fighter removed: ${storedFighter}, ${promoterDescription}.`);
      }
    }

    for (const freshFighter of freshFighters) {
      const fighterAdded = !storedFighters.includes(freshFighter);
      if (fighterAdded) {
        await _addFighter(freshFighter, promoterKey);
        tweets.push(`🥊 ✅ Fighter added: ${freshFighter}, ${promoterDescription}.`);
      }
    }
  }
  return tweets;
};

(async () => {
  try {
    Parse.initialize(process.env.REMOTE_APPLICATION_ID, process.env.REMOTE_KEY); 
    Parse.serverURL = process.env.REMOTE_URL;

    // Matchroom
    const freshMatchroomFighters = await _getFreshMatchroomFighters();
    const matchroomTweets = await _getFighterTweets(freshMatchroomFighters, 'matchroom', 'Matchroom Boxing');

    // Frank Warren
    const freshFrankWarrenFighters = await _getFreshFrankWarrenFighters();
    const frankWarrenTweets = await _getFighterTweets(freshFrankWarrenFighters, 'frank-warren', 'Frank Warren and Queensberry Promotions');

    await _tweetIncrementally([
      ...matchroomTweets,
      ...frankWarrenTweets,
    ]);
  } catch (error) {
    console.error(error);
  }
})();