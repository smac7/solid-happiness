const { TwitterApi } = require('twitter-api-v2');
const Parse = require('parse/node');
const { JSDOM } = require('jsdom');
const HtmlParser = require('node-html-parser');
const fetch = require('node-fetch');

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

const _getFreshProbellumFighters = async () => {
  try {
    const dom = await JSDOM.fromURL("https://probellum.com/athletes/");
    const root = HtmlParser.parse(dom.serialize());
    return root.querySelectorAll('.name .col').map(element => {
        return element.textContent.trim().replace(/\s\s+/g, ' ');
    }).sort();
  } catch (error) {
    console.error(error);
  }
};

const _getFreshPbcFighters = async () => {
  try {
    const dom = await JSDOM.fromURL("https://www.premierboxingchampions.com/fighters");
    const root = HtmlParser.parse(dom.serialize());
    return new Set(root.querySelectorAll('.name').map(element => {
        return element.childNodes
            .filter(node => {
                const textValue = node.textContent.trim().replace(/\s\s+/g, ' ').trim();
                return textValue !== '' && (!textValue.startsWith('\"') && !textValue.endsWith('\"'))
            })
            .map(node => node.textContent.trim().replace(/\s\s+/g, ' ').trim())
            .join(' ');            
    }).filter(textContent => textContent.includes(' ')));
  } catch (error) {
    console.error(error);
  }
};

const _getFreshBoxxerFighters = async () => {
  try {
    const domOne = await JSDOM.fromURL("https://www.boxxer.com/roster/?vp_page=1");
    const domTwo = await JSDOM.fromURL("https://www.boxxer.com/roster/?vp_page=2");

    const rootOne = HtmlParser.parse(domOne.serialize());
    const rootTwo = HtmlParser.parse(domTwo.serialize());
    const allSelections = [
      ...rootOne.querySelectorAll('.vp-portfolio__item-img-overlay'),
      ...rootTwo.querySelectorAll('.vp-portfolio__item-img-overlay'),
    ];
    return allSelections.map(element => {
      return element.querySelectorAll('h2')[0].textContent.trim();
  }).sort();
  } catch (error) {
    console.error(error);
  }
};

const _getFreshTopRankFighters = async () => {
  try {
    let fighterPage = 1;
    let fighters = [];
    while (true) {
      const params = new URLSearchParams();
      params.append('action', 'all_fighters_json');
      params.append('start', fighterPage);
  
      const response = await fetch('https://www.toprank.com/wp-admin/admin-ajax.php', {
        method: 'POST', 
        body: params, 
        headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': '*/*'}}
      );
      const pagedResponse = await response.json();
      const pagedFighters = pagedResponse.fighters;
      const isLastPage = !pagedFighters?.length > 0;
      if (isLastPage) {
        break;
      }
      const pagedFightersNames = pagedFighters.map(pagedFighter => pagedFighter.name);
  
      fighters = [...fighters, ...pagedFightersNames]
      fighterPage = fighterPage + 1;
    }
    return fighters;
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

    // Probellum
    const freshProbellumFighters = await _getFreshProbellumFighters();
    const probellumTweets = await _getFighterTweets(freshProbellumFighters, 'probellum', 'Probellum');
    
    // PBC
    const freshPbcFighters = await _getFreshPbcFighters();
    const pbcTweets = await _getFighterTweets(freshPbcFighters, 'pbc', 'Premier Boxing Champions');

    // Boxxer
    const freshBoxxerFighters = await _getFreshBoxxerFighters();
    const boxxerTweets = await _getFighterTweets(freshBoxxerFighters, 'boxxer', 'BOXXER');
    
    // Top Rank
    const freshTopRankFighters = await _getFreshTopRankFighters();
    const topRankTweets = await _getFighterTweets(freshTopRankFighters, 'top-rank', 'Top Rank');

    await _tweetIncrementally([
      ...matchroomTweets,
      ...frankWarrenTweets,
      ...probellumTweets,
      ...pbcTweets,
      ...boxxerTweets,
      ...topRankTweets,
    ]);
  } catch (error) {
    console.error(error);
  }
})();