// Require the packages we will use:
const http = require("http"),
fs = require("fs");

const port = 3456;
const file = "client.html";
// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html, on port 3456:
const server = http.createServer(function (req, res) {
    // This callback runs when a new connection is made to our HTTP server.

    fs.readFile(file, function (err, data) {
        // This callback runs when the client.html file has been read from the filesystem.

        if (err) return res.writeHead(500);
        res.writeHead(200);
        res.end(data);
    });
});
server.listen(port);

// Import Socket.IO and pass our HTTP server object to it.
const socketio = require("socket.io")(http, {
    wsEngine: 'ws'
});

// Attach our Socket.IO server to our HTTP server to listen
const io = socketio.listen(server);

let chats = {};
let users = {}; 

io.sockets.on("connection", function (socket) {
    // This callback runs when a new Socket.IO connection is established.

    socket.on('message_to_server', function (data) {
        // This callback runs when the server receives a new message from the client.
        let room = data["room"];
        console.log(room);
        io.sockets.to(room).emit("message_to_client", {message: data["message"], username: data["username"]}) // broadcast the message to other users
    });

    socket.on('getAdmins', function(data){
        let adminsList = Array.from(chats[data["chatName"]].admins)
        io.sockets.to(data["chatName"]).emit("recieveAdmins", {admins: adminsList})
    })

    socket.on('kickUser', function(data){
        if(chats[data["room"]].users.has(data["kickedUser"])){
            if(!chats[data["room"]].admins.has(data["kickedUser"])){
                removeUser(data["kickedUser"])
                let kickedSocket;

                for (const[key, value] of Object.entries(users)){
                    if (value.username == data["kickedUser"]){
                        kickedSocket = key
                    }
                }

                console.log(kickedSocket)
                //data["room"] should technically be kickedSocket. Seems to work without, so just leave it like this. 
                io.sockets.to(data["room"]).emit("leavingStatus", {message: true, username: data["kickedUser"], currRoom1: data["room"], kickedSocket: kickedSocket})
            }
        }
    })

    socket.on('banUser', function(data){
        if(chats[data["room"]].users.has(data["bannedUser"])){
            if(!chats[data["room"]].admins.has(data["bannedUser"])){
                chats[data["room"]].banList.add(data["bannedUser"])
                removeUser(data["bannedUser"])

                let kickedSocket;
                for (const[key, value] of Object.entries(users)){
                    if (value.username == data["kickedUser"]){
                        kickedSocket = key
                    }
                }

                io.sockets.to(data["room"]).emit("leavingStatus", {message: true, username: data["bannedUser"], currRoom1: data["room"]})
            }
        }
    })

    socket.on('addAdmin', function(data){
        if(chats[data["room"]].users.has(data["adminedUser"])){
            if(!chats[data["room"]].admins.has(data["adminedUser"])){
                console.log("here "+ data["adminedUser"])
                chats[data["room"]].admins.add(data["adminedUser"])
                io.sockets.to(data["room"]).emit("joinedChat", {currChat : data["room"], success: true, username: data["adminedUser"], newAdmin: true})
            }
        }
    })
     
    socket.on('newFriend', function(data){
        users[socket.id].friendList.add(data["newFriend"])
        console.log(users[socket.id].friendList)
        io.to(socket.id).emit("friend added!")
    })

    // This callback runs when a new Socket.IO connection is established.
    socket.on('setUser', function (data) {
            // This callback runs when the server receives a new message from the client.
            let userExists = false;
            console.log("user socket id" + socket.id)
            for (const[key, value] of Object.entries(users)){
                if (value.username == data["user"]){
                    userExists = true;
                }
            }

            if(!userExists){
                const friendList = new Set();
                users[socket.id] = {
                    username : data["user"],
                    chatId : "",
                    friendList : friendList
                    };
                                    
                //socket.id is the key , where 5 is the socketid users[5].username; users[5].chatId = 6;            
                io.sockets.emit("signupStatus", {result: true , username: users[socket.id].username}) // broadcast the message to other users
            } else {
                io.sockets.emit("signupStatus", {result: false, username : data["user"]}) // broadcast the message to other users
            }
    })

    function removeUser(removedUser){
        for (const[key, value] of Object.entries(chats)){
            if (value.users.has(removedUser)){
                console.log("removing: " + removedUser)
                value.users.delete(removedUser)
            }
        }
    }

    socket.on('newChat', function(data){
        console.log("og chatname" + data["password"]);
        let chatExists = false;

        for (const[key, value] of Object.entries(chats)){
            if (key == data["chatName"]){
                chatExists = true;
            }
        }

        if(!chatExists){
            let usersSet = new Set()
            let banList = new Set()
            let admins = new Set()
            removeUser(users[socket.id].username)
            usersSet.add(users[socket.id].username)
            chats[data["chatName"]] = {
                banList : banList,
                admins : admins.add(users[socket.id].username),
                users : usersSet,
                password : data["password"],
                isPrivate : "true"
            }
            console.log("here " + chats[data["chatName"]].users)
            console.log("joining upon creation" + data["chatName"]);
            socket.join(data["chatName"]);
            io.sockets.to(data["chatName"]).emit("chatStatus", {result: true, chatCreated : data["chatName"] }) 
        }
        else{
            chatExists = false;
            io.sockets.to(data["chatName"]).emit("chatStatus", {result: false}) 
        }
    })

    socket.on('homePageData', function(data){
        io.sockets.emit("homePage", {chats : chats}) 
    })

    //method adapted from video
    socket.on('joinChat' , function(data){
        let chatExists = false;
        for (const[key, value] of Object.entries(chats)){
            if (key == data["chatName"]){
                chatExists = true;
            }
        }

        //checks if user is in the chat, if not then join
        if(chatExists){
            if(chats[data["chatName"]].password == "" || data["password"] == chats[data["chatName"]].password){
                if (!chats[data["chatName"]].banList.has(data["username"])){
                    removeUser(data["username"])
                    socket.join(data["chatName"]);
                    newAdmin = false
                    let adminsList = Array.from(chats[data["chatName"]].admins)//array of all admins in the chat
                    console.log(adminsList)
                    for(let i = 0; i<adminsList.length; i++){//for loop
                    let adminName = adminsList[i]//for this particular admin
                    console.log(adminName)
                    let adminID;

                    for (const[key, value] of Object.entries(users)){
                        if (value.username == adminName){
                            adminID = key
                        }
                    }
                    console.log(adminID)
                        //gets the admin id
                        //cannot read property of undefined
                        //users[adminID] is undefined
                    if(users[adminID].friendList.has(data["username"])){//if the user joining is on the friendlist
                        chats[data["chatName"]].admins.add(data["username"])
                        newAdmin = true
                        //then add them to the admin list
                    }
                    }
                    //get socket id of admin
                    //if admin's friend list contains username
                    //then make user admin
                    console.log("new admin status" + newAdmin)
                    chats[data["chatName"]].users.add(data["username"]);
                    //pass in the username here, and pull it out in getChatData
                    console.log("joined id " + socket.id)
                    io.sockets.to(data["chatName"]).emit("joinedChat", {currChat : data["chatName"], success: true, newAdmin1 : newAdmin})
                
            }

                else {
                    console.log("this user was banned from this chat");
                }
            
            }
                 
             else {
                console.log("you got the password wrong")
                io.sockets.emit("joinedChat", {success: false}) 
            }

        }

        else{
            console.log("Chat does not exist!")
        }
    })

    socket.on('getChatData', function(data){
        let usersList = Array.from(chats[data["chatName"]].users)
        io.sockets.to(data["chatName"]).emit("displayUsers", {chatUsers1 : usersList}) 
    })

    socket.on('newPM', function(data){
        let room = data["room"];
        //if reciever is in the room
        io.sockets.to(room).emit("privateMessage", {message: data["privateMessage"], username: data["username"], reciever: data["reciever"]}) // broadcast the message to other users
    })

    socket.on('leaving', function(data){
        removeUser(data["username"])
        console.log(socket.id)
        console.log(data["currRoom"])
        io.sockets.to(data["currRoom"]).emit("leavingStatus", {message: true, username: data["username"], currRoom1: data["currRoom"]})
    })

    socket.on('socketLeave', function(data){
        let chat = data["leaveRoom"]
        socket.leave(chat)
        console.log(data["leaveRoom"])

        socket.join("lobby")
        console.log(socket.adapter.rooms)
        console.log(socket.id)
    })

    socket.on('getChats', function(data){
        let chatNameList = []
        for (const[key, value] of Object.entries(chats)){
            chatNameList.push(key);
        }
        io.sockets.emit("ListOfChats", {allChats: chatNameList});
    })
});