const nodemailer = require('nodemailer');
const express = require('express');
const cookieParser = require('cookie-parser');
const {Client} = require('pg');
const {MongoClient} = require('mongodb');
const {Server} = require('ws');
const hbs = require('hbs');
const path = require('path');


const sha256 = require('./sha256');
const loginData = require("./json/data.json");

const currentUsers = {}
const otpPending = {}
const userDetailsPending = {}

const PostgresURI = "postgres://uazxmkryvfhxnd:5e3cc9c6a59f2316e1a11307ddadd209933cb46f1b9a5c0fc331a63c51f000f9@ec2-54-220-14-54.eu-west-1.compute.amazonaws.com:5432/dgoiagutvh0rf";
const MongoDBURI = "mongodb+srv://admin:admin1@cluster0.krtas.mongodb.net/socialNetwork?retryWrites=true&w=majority";

const templatePath = path.join(__dirname, './template/view');
const partialPath = path.join(__dirname, './template/partial');

hbs.registerPartials(partialPath);

const MAILTRANSPORTER = nodemailer.createTransport({
    service: 'gmail',
    secureConnection: false,
    tls: {
        rejectUnauthorized: false,
    },
    auth:{
        user: "thesocialnetworkproject8@gmail.com",
        pass: 'thenetwork'
    }
});
const MONGODBCLIENT = new MongoClient(MongoDBURI);
const POSTGRESCLIENT = new Client({
    connectionString: PostgresURI,
    ssl: {
        rejectUnauthorized: false,
    }
});

POSTGRESCLIENT.connect();

MONGODBCLIENT.connect()
    .then(res => console.log("MongoDB has been connected"))
    .catch(err => {
        throw err
    })



const server = express()
    .use(cookieParser())
    .use([express.json(), express.static(__dirname), express.urlencoded()])

    .set('view engine', 'hbs')
    .set('views', templatePath)

    .get("/", (req, res) => {
        res.header('redirected', true);
        res.redirect("/login/");
    })
    .get("/login", (req, res) => {
        login(req, res);
    })
    .get("/create", (req, res) => {
        res.render('create');
        // res.sendFile(__dirname+"/create/Create.html");
    })
    .get("/forgot", (req, res) => {
        res.sendFile(__dirname+"/forgot/Forgot.html");
    })
    .get("/terms", (req, res) => {
        res.sendFile(__dirname+"/terms/Terms.html");
    })
    .get("/chats", (req, res) => {
        if(req.cookies['session']) res.render('chats');
        else res.redirect("/login/");
    })
    .get("/code", (req, res) => {
        res.sendFile(__dirname+"/code/Code.html");
    })
    .get("/details", (req, res) => {
        res.sendFile(__dirname + "/details/Details.html");
    })



    .post("/login", (req, res) => {
        setTimeout(() => console.log(currentUsers), 5000);
        checkLogin(req, res);
    })
    .post("/create", (req, res) => {
        createAccount(req, res);
    })
    .post("/code", (req, res) => {
        verifyCode(req,res);
    })
    .post("/details", (req, res) => {
        addDetails(req, res);
    })
    .post("/forgot", (req, res) => {
        handleForgot(req, res);
    })
    .post("/user", (req, res) => {
        sendUserDetails(req, res);
    })
    .post("/logout", (req, res) => {
        res.clearCookie('session');
        res.json({code: "SUCCESS"});
    })
    .listen(4000)

const WSS = new Server({server});

WSS.on('connection', (ws) => {

    ws.isAssigned = false;

    ws.on('message', (data) => {

        const message = JSON.parse(data);

        console.log(message);

        const CODE = message[0]

        if(!ws.isAssigned && CODE !== 8) {

            ws.terminate();
            console.log("terminated");
            console.log("Code = "+CODE);
            console.log(ws.isAssigned);
        }

        if(CODE === 8)
        {
            currentUsers[message[1]].ws = ws;
            ws.isAssigned = true;
            ws.sessionToken = message[1];
            ws.send(JSON.stringify([8]));
        }
        else if(CODE === 1)
        {
            getFriends(ws);
        }
        else if(CODE === 4)
        {
            const searchString = message[1];

            console.log("Code = "+CODE);
            searchUser(searchString, ws);

        }
        else if(CODE === 5)
        {
            addFriend(message[1], ws);
        }
        else if(CODE === 2)
        {
            getChats(message[1], ws);
        }
        else if(CODE === 3)
        {
            forwardMessage(message[1], message[2], ws);
        }


    })

})

async function forwardMessage(username, message, ws)
{
    for(const keys in currentUsers)
    {
        if(currentUsers[keys].username === username && currentUsers[keys].ws)
        {
            currentUsers[keys].ws.send(JSON.stringify([3, message.from, message]));
            console.log("----"+currentUsers[keys].username)
        }

    }

    let chatid = null;
    currentUsers[ws.sessionToken].friends.forEach(value => {
        console.log(value);
        if(value.username === username) {
            chatid = value.chatid;
        }
    });

    const response = await MONGODBCLIENT.db('socialNetwork').collection('chats').updateOne({_id: chatid}, {$push: {messages: message}})
    console.log(response);
}


async function getChats(username, ws)
{
    let chatid = null;
    currentUsers[ws.sessionToken].friends.forEach(value => {
        console.log(value);
        if(value.username === username) {
            chatid = value.chatid;
        }
    });
    console.log(currentUsers)
    console.log(chatid)

    const response = await MONGODBCLIENT.db('socialNetwork').collection('chats').findOne({_id: chatid});
    console.log(response)
    ws.send(JSON.stringify([2, username, response.messages]));
}

async function addFriend(username, ws)
{
    const user = currentUsers[ws.sessionToken];
    const chatid = userIdGenerator();
    console.log(user);
    let exists = false;

    currentUsers[ws.sessionToken].friends.forEach(value => {
        if(value.username === username) {
            exists = true;
            getChats(username, ws);
        }
    });

    if(exists) return;

    const friendid = await getUserId(username);
    const friendDetails = await getUserDetails(friendid);

    currentUsers[ws.sessionToken].friends.push({
        id: friendid,
        username: username,
        name: friendDetails.name,
        about: friendDetails.about,
        imageCode: friendDetails['image_code'],
        chatid: chatid,
    });

    const result = await addFriendOnMongo(user.userid, friendid, chatid);
    for(const keys in currentUsers)
    {
        console.log(currentUsers[keys]);
        if(currentUsers[keys].userid === friendid && currentUsers[keys].ws)
        {
            currentUsers[keys].ws.send(JSON.stringify([5, {name: user.name, username: user.username, imageCode: user.imageCode, notification: true}]));

        }
    }
    ws.send(JSON.stringify([5, {name: friendDetails.name, username: username, imageCode: friendDetails['image_code'], notification: true}]))

}

async function addFriendOnMongo(userid, friendid, chatid)
{
    const document = {
        _id: chatid,
        lasttime: new Date().getTime(),
        messages: []
    };
    const chatAdd = await MONGODBCLIENT.db('socialNetwork').collection('chats').insertOne(document);

    const userAdd = await MONGODBCLIENT.db('socialNetwork').collection('users').updateOne({_id: userid}, {$push: {friends: {id: friendid, chatid: chatid, notification: false}}});
    const friendAdd = await MONGODBCLIENT.db('socialNetwork').collection('users').updateOne({_id: friendid}, {$push: {friends: {id: userid, chatid: chatid, notification: true}}});
    return true;
}

async function getFriends(ws)
{
    const user = currentUsers[ws.sessionToken];

    const results = await MONGODBCLIENT.db('socialNetwork').collection('users').findOne({_id: user.userid});

    const temp = [];
    const sendList = [];
    for (const item of results.friends)
    {
        const username = await getUserName(item.id);
        const details = await getUserDetails(item.id);
        const temp1 = {
            id: item.id,
            username: username,
            name: details.name,
            about: details.about,
            imageCode: details['image_code'],
            chatid: item.chatid,
        }
        const temp2 = {
            username: username,
            name: details.name,
            about: details.about,
            imageCode: details['image_code'],
        }
        temp.push(temp1);
        sendList.push(temp2);
    }
    currentUsers[ws.sessionToken].friends = temp;
    ws.send(JSON.stringify([1,sendList]));

}

async function searchUser(searchString, ws)
{
    const query = `select userid, username from user_credentials where username like '${searchString}%'`;

    const result = await POSTGRESCLIENT.query(query);
    console.log(result);

    const temp = [];

    for (const value of result.rows) {
        if(currentUsers[ws.sessionToken].username === value.username) continue;
        const data = await getUserDetails(value.userid);
        const temp1 = {
            username: value.username,
            name: data.name,
            imageCode: data['image_code'],
        }
        console.log(temp1);
        temp.push(temp1);
    }
    console.log("temp");
    console.log(temp);
    ws.send(JSON.stringify([4, temp]));
}

async function sendUserDetails(req, res)
{
    const token = req.cookies['session'];
    if(currentUsers[token])
    {
        const temp = {
            username: currentUsers[token].username,
            name: currentUsers[token].name,
            about: currentUsers[token].about,
            imageCode: currentUsers[token].imageCode,
        };
        res.json(temp);
    }
    else {
        res.json({code: "FAIL"});
    }
}

async function handleForgot(req, res)
{
    const code = req.body.code;

    if(code === 1)
    {
        const email = req.body.email;
        const otpToken = tokenGenerator();
        res.cookie('token', otpToken);
        otpPending[otpToken] = {
            email: email
        }
        const status = await sendOTPMail(otpToken, email);
        res.json({code: "SUCCESS"})
    }
    else if(code === 2)
    {
        const veriCode = req.body.verificationcode;
        const token = req.cookies['token'];
        if(otpPending[token].code === parseInt(veriCode)) {
            res.clearCookie('token');
            const newToken = tokenGenerator();
            res.cookie('token', newToken)
            otpPending[newToken] = {
                email: otpPending[token].email
            }
            otpPending[token] = null;
            res.json({code: "SUCCESS"})
        }
        else res.json({code: "FAIL"});
    }
    else if(code === 3)
    {
        const token = req.cookies['token'];
        const password = req.body.password;
        const status = await updatePassword(otpPending[token].email, password)
        res.clearCookie('token');
        otpPending[token] = null;
        res.json({code: "SUCCESS"});
    }
}

async function updatePassword(email, password)
{
    const query = `update user_credentials set password='${password}' where email='${email}'`

    const response = await POSTGRESCLIENT.query(query);
    return true
}

async function addDetails(req, res)
{
    const token = req.cookies['token'];

    if(!token) res.json({code: "FAIL"})
    else {
        const name = req.body.name;
        const about = req.body.about;
        const imageCode = Math.floor(Math.random()*20)+1;
        const userid = userIdGenerator();
        const lastActiveTime = new Date().getTime();
        userDetailsPending[token].name = name;
        userDetailsPending[token].about = about
        userDetailsPending[token].imageCode = imageCode;
        userDetailsPending[token].userid = userid;
        userDetailsPending[token].lastActiveTime = lastActiveTime;

        const userCredentialStatus = await addUserCredentials(token);
        const userDetailsStatus = await addUserDetails(token);
        const sessionToken = tokenGenerator();
        const sessionAdded = await addSessionToken(sessionToken, userid);
        const mongoAdded = await addUserOnMongoDB(userid);

        res.clearCookie('token');
        res.cookie('session', sessionToken);
        res.json({code: "SUCCESS"});

    }
}

async function addUserOnMongoDB(userid)
{
    const document = {
        _id: userid,
        friends: [],
        groups: []
    }
    const results = await MONGODBCLIENT.db('socialNetwork').collection("users").insertOne(document);
    console.log(results);
    return true
}

async function addUserCredentials(token)
{
    const query = `insert into user_credentials values('${userDetailsPending[token].userid}', '${userDetailsPending[token].username}', '${userDetailsPending[token].password}', '${userDetailsPending[token].email}')`

    const response = await POSTGRESCLIENT.query(query);
    return true
}

async function addUserDetails(token)
{
    const query = `insert into user_details values('${userDetailsPending[token].userid}', '${userDetailsPending[token].name}', '${userDetailsPending[token].about}', '${userDetailsPending[token].imageCode}', '${userDetailsPending[token].lastActiveTime}')`

    const response = await POSTGRESCLIENT.query(query);
    return true
}

async function verifyCode(req, res)
{
    const code = req.body.code;
    const token = req.cookies['token'];

    if(!otpPending[token]) res.json({code: "FAIL"});
    else
    {
        if(otpPending[token].code !== parseInt(code)){
            res.json({code: "FAIL"});
        }
        else
        {
            const newToken = tokenGenerator();
            userDetailsPending[newToken] = {
                username: otpPending[token].username,
                password: otpPending[token].password,
                email: otpPending[token].email,
            }
            otpPending[token] = null;

            res.cookie('token', newToken);
            res.json({code: "SUCCESS"})

        }
    }


}

async function createAccount(req, res)
{
    const password = req.body.password;
    const username = req.body.username;
    const email = req.body.email;

    const exists = await checkUsernameAndEmail(username, email);

    if(exists){
        res.json({code: "EXISTS"});
    }
    else
    {
        const otpToken = tokenGenerator();

        otpPending[otpToken] = {
            username: username,
            password: password,
            email: email,
        }

        const message = await sendOTPMail(otpToken, email);

        res.cookie('token', otpToken);

        res.json({code: "SUCCESS"})
    }
}

async function sendOTPMail(optToken, email)
{
    const code = Math.floor(Math.random() * 900000) + 100000
    const mail = {
        from: "thesocialnetworkproject8@gmail.com",
        to: email,
        subject: "The social Network - Verification Code",
        text: `The verification code for your The Social Network account is - ${code}`
    }

    MAILTRANSPORTER.sendMail(mail, (error, info) =>
    {
        return "SUCCESS"
    });

    otpPending[optToken].code = code;
}

async function checkUsernameAndEmail(username, email)
{
    const query = `select * from user_credentials where username='${username}' or email='${email}';`

    const response = await POSTGRESCLIENT.query(query);
    if(response.rows.length === 0)
    {

        return false
    }
    return true
}


async function checkLogin(req, res)
{
    const password = req.body.password;
    const username = req.body.username;
    let userid = null
    console.log(req.body)

    const query = `select userid from user_credentials where username='${username}' and password='${password}'`;

    POSTGRESCLIENT.query(query, (err, response) => {
        if ( err ) {
            throw err;
        }
        else {

            if(response.rows.length === 0) res.json({code: "FAIL"});
            else {
                userid = response.rows[0].userid;
                const sessionToken = tokenGenerator();
                addSessionToken(sessionToken, userid).then(data => {
                    res.cookie('session', sessionToken);
                    res.json({code: "SUCCESS"});
                })
            }
        }
    })


}

async function addSessionToken(sessionToken, userid)
{
    const query = `insert into session_tokens values('${sessionToken}', '${userid}')`;

    POSTGRESCLIENT.query(query, (err, response) => {
        if ( err ) throw err;
        else {
            return "SUCCESS"
        }
    })
}

async function login(req, res)
{
    const sessionToken = req.cookies['session'];

    if ( sessionToken )
    {
        sessionGetUserId(sessionToken)
            .then(userid => {
                if(userid)
                {
                    makeLogin(userid, sessionToken)
                        .then(data => {
                            res.header('redirected', true);
                            res.redirect("/chats/");
                        });
                }
                else {
                    res.clearCookie('session');
                    res.render('login', loginData);
                }
            });
    }
    else
    {
        res.render('login', loginData);
    }
}

async function makeLogin(userid, sessionToken)
{
    const username = await getUserName(userid);
    const details = await getUserDetails(userid);

    if (!details || !username) {
        throw new Error("Problem with user data");
    }

    currentUsers[sessionToken] = {
        userid: userid,
        username: username,
        name: details.name,
        about: details.about,
        imageCode: details['image_code'],
    }

    return "SUCCESS"
}

async function getUserName(userid)
{
    const query = `select username from user_credentials where userid='${userid}'`;

    const response = await POSTGRESCLIENT.query(query);
    if(response.rows.length === 0) return false;
    return response.rows[0].username;
}

async function getUserDetails(userid)
{
    const query = `select name,about,image_code from user_details where userid='${userid}'`;

    const response = await POSTGRESCLIENT.query(query)
    if(response.rows.length === 0) return false;
    return response.rows[0];
}

async function getUserId(username)
{
    const query = `select userid from user_credentials where username='${username}'`;

    const response = await POSTGRESCLIENT.query(query);
    console.log(response);
    return response.rows[0].userid;
}

async function sessionGetUserId(session)
{
    const query = `select userid from session_tokens where session_token='${session}'`;

    const response = await POSTGRESCLIENT.query(query)
    if(response.rows.length === 0) return false
    return response.rows[0].userid
}

function tokenGenerator()
{
    let string = ""
    for ( let i = 0 ; i < 20 ; i++ )
        string = string + String.fromCharCode(Math.floor(Math.random() * 26) + 65);
    return sha256(string);
}

function userIdGenerator()
{
    let string = ""
    for ( let i = 0 ; i < 20 ; i++ )
        string = string + String.fromCharCode(Math.floor(Math.random() * 26) + 65);
    return string;
}