const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const path = require("path");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    Response.send(`DB Error: ${error.message}`);
  }
};

initializeDbAndServer();

const validatePassword = (password) => {
  return password.length > 6;
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        console.log(jwtToken);
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const checkValidTweetId = async (request, response, next) => {
  let { tweetId } = request.params;
  const { username } = request;
  tweetId = parseInt(tweetId);
  const getFollowingUserId = `
    SELECT
      follower_user_id
    FROM 
      follower JOIN user ON follower.following_user_id = user.user_id
    WHERE 
      user.username = '${username}';`;

  const userIds = await database.all(getFollowingUserId);

  let usrId = [];
  for (let i of userIds) {
    usrId.push(i.follower_user_id);
  }

  let twtIds = [];
  for (let id of usrId) {
    const getTweetId = `
        SELECT 
          tweet_id
        FROM
          tweet
        WHERE 
          user_id = ${id};`;
    const tweetId = await database.all(getTweetId);
    for (let twtId of tweetId) {
      twtIds.push(twtId);
    }
  }

  let tIds = [];
  for (let id of twtIds) {
    tIds.push(id.tweet_id);
  }

  if (tIds.includes(tweetId) === false) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

const checkValidUserTweetId = async (request, response, next) => {
  let { tweetId } = request.params;
  tweetId = parseInt(tweetId);
  const { username } = request;
  const getUserTweetIds = `
      SELECT 
        tweet_id 
      FROM 
        tweet JOIN user ON tweet.user_id = user.user_id 
      WHERE
        user.username = '${username}';`;
  const userTweets = await database.all(getUserTweetIds);
  console.log(userTweets);
  let tweetIds = [];
  for (let id of userTweets) {
    tweetIds.push(id.tweet_id);
  }
  console.log(tweetIds);
  if (tweetIds.includes(tweetId) === false) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user (username, name, password, gender)
     VALUES
      (
       '${username}',
       '${name}',
       '${hashedPassword}',
       '${gender}' 
      );`;
    if (validatePassword(password)) {
      await database.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const twitterDbUser = `SELECT * FROM user WHERE username = '${username}';`;
  const twitterUser = await database.get(twitterDbUser);
  if (twitterUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    isPasswordMatched = await bcrypt.compare(password, twitterUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.status(200);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getTweets = `
      SELECT 
        user.username,
        tweet,
        date_time
      FROM 
        tweet JOIN user ON tweet.user_id = user.user_id;`;
  const tweets = await database.all(getTweets);
  response.send(tweets);
});

//api-3 Returns the latest tweets of people whom the user follows. Return 4 tweets at a time

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  let getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await database.get(getUserId);

  const getTweets = `
      SELECT 
        user.username,
        tweet,
        date_time AS dateTime
      FROM 
        tweet JOIN follower ON tweet.user_id = follower.following_user_id JOIN user ON tweet.user_id = user.user_id
      WHERE 
        follower.follower_user_id = ${userId.user_id}
      GROUP BY
        tweet.tweet_id
      ORDER BY
        tweet.date_time DESC
      LIMIT
        4;`;
  const tweets = await database.all(getTweets);
  response.send(tweets);
});

//api-4 Returns the list of all names of people whom the user follows

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const userFollowingId = `
    SELECT 
      following_user_id
    FROM
      follower JOIN user ON follower.follower_user_id = user.user_id
    WHERE
      user.username = '${username}';`;
  const userIds = await database.all(userFollowingId);
  let f = [];
  for (let fol of userIds) {
    f.push(fol.following_user_id);
  }

  let n = [];
  for (let id of f) {
    const following = `
        SELECT 
          name
        FROM 
          user
        WHERE 
          user_id = ${id};`;
    const user = await database.all(following);
    for (let u of user) {
      n.push(u);
    }
  }
  response.send(n);
});

/// api-5 Returns the list of all names of people who follows the user

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getFollowers = `
      SELECT 
        follower_user_id 
      FROM 
        follower JOIN user ON follower.following_user_id = user.user_id
      WHERE 
        user.username = '${username}';`;
  const followers = await database.all(getFollowers);

  let f = [];

  for (let follower of followers) {
    f.push(follower.follower_user_id);
  }
  console.log(f);
  let u = [];
  for (let id of f) {
    const getUserName = `
        SELECT 
          name 
        FROM 
          user 
        WHERE 
          user_id = ${id};`;

    const userNames = await database.all(getUserName);
    console.log(userNames);
    for (let user of userNames) {
      u.push(user);
    }
  }
  response.send(u);
});

//api-6 (1) If the user requests a tweet other than the users he is following.
// (2) If the user requests a tweet of the user he is following, return the tweet, likes count, replies count and date-time

app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  checkValidTweetId,
  async (request, response) => {
    const { tweetId } = request.params;

    const getLikes = `SELECT COUNT(*) AS likes FROM like WHERE tweet_id = ${tweetId};`;
    const likeCount = await database.get(getLikes);

    const getReplies = `SELECT COUNT(*) AS replies FROM reply WHERE tweet_id = ${tweetId};`;
    const replyCount = await database.get(getReplies);

    const getTweet = `
      SELECT 
        tweet,
        date_time AS dateTime
      FROM
        tweet JOIN like ON tweet.tweet_id = like.tweet_id JOIN reply on like.tweet_id = reply.tweet_id
      WHERE 
        tweet.tweet_id = ${tweetId};`;
    const userTweet = await database.get(getTweet);
    response.send({
      tweet: userTweet.tweet,
      likes: likeCount.likes,
      replies: replyCount.replies,
      dateTime: userTweet.dateTime,
    });
  }
);

//api-7 If the user requests a tweet of a user he is following, return the list of usernames who liked the tweet
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  checkValidTweetId,
  async (request, response) => {
    const { tweetId } = request.params;
    let userIds = [];
    const getUserIds = `SELECT user_id FROM like WHERE tweet_id = ${tweetId};`;
    const uIds = await database.all(getUserIds);
    for (let id of uIds) {
      userIds.push(id.user_id);
    }
    console.log(userIds);
    let userNames = [];
    for (let id of userIds) {
      const getUserName = `SELECT username FROM user WHERE user_id = ${id};`;
      const user = await database.get(getUserName);
      userNames.push(user.username);
    }
    console.log(userNames);
    response.send({
      likes: userNames,
    });
  }
);

//api-8 If the user requests a tweet of a user he is following, return the list of replies.

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  checkValidTweetId,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweet = `SELECT tweet FROM tweet WHERE tweet_id = ${tweetId};`;
    const userTweet = await database.get(getTweet);
    const getUserAndReply = `
      SELECT 
        user.name AS name,
        reply
      FROM
        reply JOIN user ON reply.user_id = user.user_id 
      WHERE 
        tweet_id = ${tweetId};`;
    const usersAndReplies = await database.all(getUserAndReply);
    console.log(usersAndReplies);
    response.send({
      replies: usersAndReplies,
    });
  }
);

//api-9 Returns a list of all tweets of the user

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;

  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;

  const userId = await database.get(getUserId);

  let usrId = userId.user_id;
  let twtIds = [];
  const getTweetIds = `SELECT tweet_id FROM tweet WHERE user_id = ${usrId};`;
  const tweetIds = await database.all(getTweetIds);

  for (let id of tweetIds) {
    twtIds.push(id.tweet_id);
  }

  let tweets = [];
  for (let twtId of twtIds) {
    const getTweetDetails = `
      SELECT 
        tweet,
        (SELECT COUNT(*) FROM like WHERE tweet_id = ${twtId}) AS likes,
        (SELECT COUNT(*) FROM reply WHERE tweet_id = ${twtId}) AS replies,
        date_time AS dateTime
      FROM
        tweet
      WHERE 
        tweet_id = ${twtId};`;
    const twtDetails = await database.get(getTweetDetails);
    tweets.push(twtDetails);
  }
  response.send(tweets);
});

//api-10 Create a tweet in the tweet table

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  let { tweet } = request.body;
  const getUserId = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await database.get(getUserId);
  const createTweet = `
      INSERT INTO 
        tweet (tweet)
      VALUES 
        ('${tweet}');`;
  await database.run(createTweet);
  response.send("Created a Tweet");
});

//api-11 If the user deletes his tweet

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  checkValidUserTweetId,
  async (request, response) => {
    let { tweetId } = request.params;
    console.log(tweetId);
    const deleteTweet = `
      DELETE FROM
        tweet 
      WHERE 
        tweet_id = ${tweetId};`;
    await database.run(deleteTweet);
    response.send("Tweet Removed");
  }
);

module.exports = app;
