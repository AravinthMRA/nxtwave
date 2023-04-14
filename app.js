const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
let database = null;

// Initialize DB and Server
const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("The Server is running at http://localhost:3000");
    });
  } catch (e) {
    console.log(e.message);
  }
};

// Main Commands
initializeDbAndServer();

// API-1:
app.post("/register/", async (request, response) => {
  try {
    const { username, password, name, gender } = request.body;
    const checkUserPresenceQuery = `
    SELECT username
    FROM user
    WHERE username = "${username}";
    `;
    const dbUser = await database.get(checkUserPresenceQuery);
    // check user and password
    if (dbUser !== undefined) {
      response.status(400);
      response.send("User already exists");
      return;
    }
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
      return;
    }
    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    // adding user
    const addUserQuery = `
    INSERT INTO user (name, username, password, gender)
    VALUES ("${name}","${username}","${hashedPassword}","${gender}");
    `;
    await database.run(addUserQuery);
    response.send("User created successfully");
  } catch (e) {
    console.log(e.message);
  }
});

// API-2:
app.post("/login/", async (request, response) => {
  try {
    const { username, password } = request.body;
    const checkUserPresenceQuery = `
    SELECT *
    FROM user
    WHERE username = "${username}";
    `;
    const dbUser = await database.get(checkUserPresenceQuery);
    // check user and password
    if (dbUser === undefined) {
      response.status(400);
      response.send("Invalid user");
      return;
    }
    const isPasswordMatching = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatching === false) {
      response.status(400);
      response.send("Invalid password");
      return;
    }
    const payload = {
      username: username,
    };
    const jwtToken = jwt.sign(payload, "messiToBarcelona");
    response.send({ jwtToken });
  } catch (e) {
    console.log(e.message);
  }
});

// Authentication with JWT Token
const authenticateToken = async (request, response, next) => {
  try {
    let jwtToken;
    const authHeader = request.headers["authorization"];
    if (authHeader !== undefined) {
      jwtToken = authHeader.split(" ")[1];
    }
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "messiToBarcelona", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      });
    }
  } catch (e) {
    console.log(e.message);
  }
};

// get user_id
const getUserId = async (request, response, next) => {
  try {
    const { username } = request;
    const getUserId = `
    SELECT user_id
    FROM user
    WHERE username = "${username}";
    `;
    const dbUser = await database.get(getUserId);
    request.userId = dbUser.user_id;
    next();
  } catch (e) {
    console.log(e.message);
  }
};
// API-3:
app.get(
  "/user/tweets/feed",
  [authenticateToken, getUserId],
  async (request, response) => {
    try {
      const { userId } = request;
      const getTweetsQuery = `
    SELECT 
        user.username AS username,
        T.tweet AS tweet,
        T.date_time AS dateTime
    FROM (follower
        INNER JOIN tweet ON tweet.user_id = follower.following_user_id) AS T
        INNER JOIN user ON user.user_id = T.user_id
    WHERE follower.follower_user_id = ${userId}
    ORDER BY T.date_time DESC
    LIMIT 4;
    `;
      const dbResponse = await database.all(getTweetsQuery);
      response.send(dbResponse);
    } catch (e) {
      console.log(e.message);
    }
  }
);

// API-4: Returns the list of all names of people whom the user follows
app.get(
  "/user/following/",
  [authenticateToken, getUserId],
  async (request, response) => {
    try {
      const { userId } = request;
      const getFollowingQuery = `
    SELECT 
        T.name
    FROM (follower
        INNER JOIN user ON user.user_id =  follower.following_user_id) AS T
    WHERE T.follower_user_id = ${userId};
    `;
      const dbResponse = await database.all(getFollowingQuery);
      console.log(dbResponse);
      response.send(dbResponse);
    } catch (e) {
      console.log(e.message);
    }
  }
);

// API-5: Returns the list of all names of people who follows the user
app.get(
  "/user/followers/",
  [authenticateToken, getUserId],
  async (request, response) => {
    try {
      const { userId } = request;
      const getFollowingQuery = `
        SELECT 
            T.name
        FROM (follower
            INNER JOIN user ON user.user_id =  follower.follower_user_id) AS T
        WHERE T.following_user_id = ${userId};
        `;
      const dbResponse = await database.all(getFollowingQuery);
      response.send(dbResponse);
    } catch (e) {
      console.log(e.message);
    }
  }
);

// API-9:
app.get(
  "/user/tweets/",
  [authenticateToken, getUserId],
  async (request, response) => {
    try {
      const { userId } = request;
      const getUserTweets = `
      SELECT 
            tweet.tweet,
            COUNT(DISTINCT like.like_id) AS likes,
            COUNT(DISTINCT reply.reply_id) AS replies,
            tweet.date_time AS dateTime
        FROM tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
                    INNER JOIN like ON tweet.tweet_id = like.tweet_id
        WHERE tweet.user_id = ${userId}
        GROUP BY tweet.tweet_id;
      `;
      const dbResponse = await database.all(getUserTweets);
      response.send(dbResponse);
    } catch (e) {
      console.log(e.message);
    }
  }
);

// API-6: get tweets from following users by tweet_id
app.get(
  "/tweets/:tweetId/",
  [authenticateToken, getUserId],
  async (request, response) => {
    try {
      const { tweetId } = request.params;
      const { userId } = request;
      // check if user follows
      const checkUserQuery = `
        SELECT *
        FROM (tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id) AS T
        WHERE T.tweet_id = ${tweetId}
            AND T.follower_user_id = ${userId};
        `;
      const dbUser = await database.get(checkUserQuery);
      if (dbUser === undefined) {
        response.status(401);
        response.send("Invalid Request");
        return;
      } else {
        // get tweet
        const getTweetsQuery = `
        SELECT 
            tweet.tweet,
            COUNT(DISTINCT like.like_id) AS likes,
            COUNT(DISTINCT reply.reply_id) AS replies,
            tweet.date_time AS dateTime
        FROM tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
                    INNER JOIN like ON tweet.tweet_id = like.tweet_id
        WHERE tweet.tweet_id = ${tweetId}
        GROUP BY tweet.tweet_id;
        `;
        const dbResponse = await database.get(getTweetsQuery);
        response.send(dbResponse);
      }
    } catch (e) {
      console.log(e.message);
    }
  }
);

// API-7:
app.get(
  "/tweets/:tweetId/likes/",
  [authenticateToken, getUserId],
  async (request, response) => {
    try {
      const { tweetId } = request.params;
      const { userId } = request;
      // check if user follows
      const checkUserQuery = `
        SELECT *
        FROM (tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id) AS T
        WHERE T.tweet_id = ${tweetId}
            AND T.follower_user_id = ${userId};
        `;
      const dbUser = await database.get(checkUserQuery);
      if (dbUser === undefined) {
        response.status(401);
        response.send("Invalid Request");
        return;
      } else {
        // get tweet
        const getTweetsQuery = `
        SELECT 
            user.name AS likes
        FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
                    INNER JOIN user ON user.user_id = like.user_id
        WHERE tweet.tweet_id = ${tweetId};
        GROUP BY tweet.tweet_id;
        `;
        const dbResponse = await database.all(getTweetsQuery);
        const formattedArr = dbResponse.map((eachLike) => eachLike.likes);
        response.send({ likes: formattedArr });
      }
    } catch (e) {
      console.log(e.message);
    }
  }
);

// API-8:
app.get(
  "/tweets/:tweetId/replies/",
  [authenticateToken, getUserId],
  async (request, response) => {
    try {
      const { tweetId } = request.params;
      const { userId } = request;
      // check if user follows
      const checkUserQuery = `
        SELECT *
        FROM (tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id) AS T
        WHERE T.tweet_id = ${tweetId}
            AND T.follower_user_id = ${userId};
        `;
      const dbUser = await database.get(checkUserQuery);
      if (dbUser === undefined) {
        response.status(401);
        response.send("Invalid Request");
        return;
      } else {
        // get tweet
        const getTweetsQuery = `
        SELECT 
            user.name AS name, 
            reply.reply
        FROM tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
                    INNER JOIN user ON user.user_id = like.user_id
        WHERE tweet.tweet_id = ${tweetId};
        GROUP BY tweet.tweet_id;
        `;
        const dbResponse = await database.all(getTweetsQuery);
        const formattedArr = dbResponse.map((eachReply) => {
          var obj = {
            name: eachReply.name,
            reply: eachReply.reply,
          };
          return obj;
        });
        response.send({ replies: formattedArr });
      }
    } catch (e) {
      console.log(e.message);
    }
  }
);

// API-10:
app.post(
  "/user/tweets/",
  [authenticateToken, getUserId],
  async (request, response) => {
    try {
      const { userId } = request;
      const { tweet } = request.body;
      const postNewTweet = `
    INSERT INTO tweet (tweet, user_id)
    VALUES
        ("${tweet}", ${userId});
    `;
      await database.run(postNewTweet);
      response.send("Created a Tweet");
    } catch (e) {
      console.log(e.message);
    }
  }
);

// API-11:
app.delete(
  "/tweets/:tweetId/",
  [authenticateToken, getUserId],
  async (request, response) => {
    try {
      const { userId } = request;
      const { tweetId } = request.params;
      // check user authority to delete
      const checkUser = `
      SELECT *
      FROM tweet
      WHERE user_id = ${userId}
        AND tweet_id = ${tweetId}
      `;
      const dbCheck = await database.get(checkUser);
      if (dbCheck === undefined) {
        response.status(401);
        response.send("Invalid Request");
        return;
      }
      const deleteTweetQuery = `
      DELETE FROM tweet
      WHERE tweet_id = ${tweetId};
      `;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } catch (e) {
      console.log(e.message);
    }
  }
);

module.exports = app;
