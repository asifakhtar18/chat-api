const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const jwt  = require('jsonwebtoken');
const cors = require('cors')
const cookieParser = require('cookie-parser')
const bcrypt = require('bcrypt');
const ws = require('ws')
const fs  = require('fs');

const user = require('./models/user');
const Message = require('./models/message')
dotenv.config();

dbUrl = 'mongodb+srv://mychat:koEXUZBl4vYmsntv@cluster0.makaubj.mongodb.net/?retryWrites=true&w=majority'

mongoose.connect(dbUrl )
const jwtSecret = process.env.JWT_SECRET;

const app = express();
app.use('/uploads', express.static(__dirname + '/uploads'));
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


    app.get('/profile' , (req,res) =>{
        console.log(req.cookies)
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

app.post('/logout', (req,res) => {
    res.cookie('token', '', {sameSite:'none', secure:true}).json('ok');
  });

app.post('/register' , async (req , res) =>{
    const {username , password } = req.body;
    
    const isAlreadyUser =  await user.findOne({username:username})

    if(!isAlreadyUser){
        
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
    }else{
        return res.status(400).json({err : "User already exists !!" });
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
            clearInterval(connection.timer)
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
        
        const { recipient , text , file} = messageData;
        
       
        let filename = null;
        
        if(file) {
            const parts = file.name.split('.');
            const ext = parts[parts?.length - 1];
            filename = Date.now() + '.' + ext;
            const path = __dirname + '/uploads/' + filename;
            const bufferData = new Buffer.from(file.data.split(',')[1], 'base64');
            fs.writeFile( path , bufferData , () =>{
                console.log("path : " + path)
             } )
        }
        if(recipient , text || file){
            const messageDoc = await Message.create({
                sender:connection.userId,
                recipient,
                text, 
                file: file ? filename : null ,
            });

            [...wss.clients]
            .filter(c => c.userId === recipient)
            .forEach(c => c.send(JSON.stringify({
                text , 
                sender:connection.userId,
                recipient,
                file: file ? filename : null,
                _id:messageDoc._id,
            })))
        
        }


    });

  
    notifyAboutOnlinePeople();


});































//koEXUZBl4vYmsntv

//mongodb+srv://mychat:<password>@cluster0.makaubj.mongodb.net/?retryWrites=true&w=majority