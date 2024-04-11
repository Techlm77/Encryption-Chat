const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');

const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/example.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/example.com/fullchain.pem'),
};

const server = https.createServer(options);
const wss = new WebSocket.Server({ server });

const users = {};

wss.on('connection', (ws) => {
    let username = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);
    
        if (data.type === 'register') {
            username = data.username;
            users[username] = {
                ws: ws,
                lastHeartbeat: Date.now(),
            };
    
            sendActiveUsersToAll();
        } else if (data.type === 'communication' && username) {
            const { targetUserId, encryptedMessage } = data;
            const targetUser = users[targetUserId];
    
            if (targetUser) {
                targetUser.ws.send(JSON.stringify({
                    type: 'communication',
                    senderUserId: username,
                    encryptedMessage: encryptedMessage
                }));
            }
        } else if (data.type === 'heartbeat' && username && users[username]) {
            users[username].lastHeartbeat = Date.now();
        }
    });    

    ws.on('close', () => {
        if (username) {
            delete users[username];
            sendActiveUsersToAll();
        }
    });
});

function sendActiveUsersToAll() {
    const activeUsers = Object.keys(users);
    Object.values(users).forEach(user => {
        user.ws.send(JSON.stringify({ type: 'activeUsers', activeUsers: activeUsers }));
    });
}

setInterval(() => {
    const currentTime = Date.now();
    Object.keys(users).forEach(username => {
        const user = users[username];
        const timeSinceLastHeartbeat = currentTime - user.lastHeartbeat;
        if (timeSinceLastHeartbeat > 60000) {
            user.ws.terminate();
            delete users[username];
            sendActiveUsersToAll();
            console.log(`User ${username} disconnected due to inactivity`);
        }
    });
}, 60000);

server.listen(8446, () => {
    console.log('WebSocket server is listening on port 8446');
});
