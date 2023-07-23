const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const jwt  = require('jsonwebtoken');
const cors = require('cors')
const cookieParser = require('cookie-parser')
const bcrypt = require('bcrypt');
const ws = require('ws')

const user = require('./models/user');
const Message = require('./models/message')
dotenv.config();

mongoose.connect(process.env.MONGO_URL )
const jwtSecret = process.env.JWT_SECRET;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    credentials : true,
    origin: process.env.CLIENT_URL
}));



const bcryptSalt  = bcrypt.genSaltSync(10)

async function getUserDataFromRequest(req) {
    return new Promise((resolve , reject) => {
        const token = req.cookies?.token;
        if(token){
            jwt.verify(token , jwtSecret , {} , (err, userdata ) =>{
                if(err) throw err;
                resolve(userdata);
            })
        }else {
            reject('no token');
        }

    });
}










app.get('/test' , (req , res) => {
  res.json('test.ok');   
})

app.get('/messages/:userId' , async (req ,res) => {
    const { userId } = req.params;
    const userData = await getUserDataFromRequest(req);
    const ourUserId = userData.userId;
    const messages = await Message.find({
        sender: {$in: [userId , ourUserId]},
        recipient:{$in: [userId , ourUserId ]},
    }).sort({createdAt:1});

    res.json(messages)
});

app.get('/people' , async (req , res) =>{
    const users = await user.find({} , {'_id':1, 'username':1});
    res.json(users);
})

try{
    app.get('/profile' , (req,res) =>{
        const token = req.cookies?.token;

        if(token){
            jwt.verify(token , jwtSecret , {} , (err, userdata ) =>{
                if(err) throw err;
                res.json(userdata);
            });
        }  else{
            res.status(401).json('no token');
        }
    });
}
catch(err) {
    throw err;
}  

app.post('/login' , async (req , res) =>{
    const {username , password} = req.body
    const foundUser = await user.findOne({username});
    
    if(foundUser){
        const passOk = bcrypt.compareSync(password , foundUser.password)
        if(passOk){
            jwt.sign({userId:foundUser._id , username} , jwtSecret , {} , (err , token)=> {
                if(err) throw err;
                res.cookie('token' , token).json({
                    id: foundUser._id
                })
            });
        }
    }

})

app.post('/register' , async (req , res) =>{
    const {username , password } = req.body;
    const hashedPw = bcrypt.hashSync(password , bcryptSalt)
    try {
        const createdUser = await user.create({
            username:username , 
            password:hashedPw,
        })
        jwt.sign({userId:createdUser._id , username } ,jwtSecret , {} , ((err , token) =>{
            if(err) throw err;
            res.cookie('token' , token ).status(201).json({
               id: createdUser._id,
               
            });
        }))
    } catch(err){
        if(err) throw err;
        res.status(500).json('error');
    }
});

const server = app.listen(4000 ,() => {
    console.log("Server started")
});



const wss = new ws.WebSocketServer({server});

function notifyAboutOnlinePeople(){

    [...wss.clients].forEach(client =>{
        client.send(JSON.stringify({
            online:[...wss.clients].map( c => ({
                userId:c.userId,
                username:c.username
            }))
        }))
    } )
}


wss.on('connection' ,(connection, req) =>{

    connection.isAlive = true;


    connection.timer = setInterval(() => {
        connection.ping();
        connection.deathTimer = setTimeout(() => {
            connection.isAlive = false;
            connection.terminate();
            notifyAboutOnlinePeople();

        } , 1000)
    } , 5000);

    connection.on('pong' , ()=>{
        clearTimeout(connection.deathTimer);
    })

    //read username and id from cookie
    const cookies = req.headers.cookie;
    if(cookies){
        const tCookiestr = cookies.split(';').find(str => str.startsWith('token='))
        if(tCookiestr){
            const token = tCookiestr.split('=')[1]
            if(token){
                jwt.verify(token , jwtSecret , {} , (err , userData) =>{
                    if(err) throw err;
                    const {userId , username} = userData;
                    connection.userId = userId;
                    connection.username = username;
                });
            }
        }
    
    }

    //sending message
    connection.on('message' , async (message) =>{
        const messageData = JSON.parse(message.toString())
        const { recipient , text } = messageData
        if(recipient , text){
            const messageDoc = await Message.create({
                sender:connection.userId,
                recipient,
                text, 
            });

            [...wss.clients].filter(c => c.userId === recipient)
            .forEach(c => c.send(JSON.stringify({
                text , 
                sender:connection.userId,
                recipient,
                _id:messageDoc._id,
            })))
        
        }


    });

  
    notifyAboutOnlinePeople();


});































//koEXUZBl4vYmsntv

//mongodb+srv://mychat:<password>@cluster0.makaubj.mongodb.net/?retryWrites=true&w=majority