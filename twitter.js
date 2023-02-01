const { TwitterApi } = require('twitter-api-v2');

const tweet = async (status) => {

    const twitterClient = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRE,
        // Following access tokens are not required if you are
        // at part 1 of user-auth process (ask for a request token)
        // or if you want a app-only client (see below)
        accessToken: process.env.TWITTER_API_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });
  
  await twitterClient.v2.tweet(status);
};

(async () => {
  try {
    const myTweet = 'Jab from the bot';

    await tweet(myTweet);
  } catch (err) {
    console.error(err);
  }
})();