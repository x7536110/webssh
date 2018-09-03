const fs = require('fs');
const path = require('path');
const utf8 = require('utf8');
const http = require('http')
const socketio = require('socket.io')
const SSHClient = require('ssh2').Client;
const express = require('express')
const sshConfig = require('./sshConfig')

let app = express()

let distpath = path.join(__dirname, '/xterm/dist');

app.use('/', express.static(distpath));

let server = http.createServer(app);
let io = socketio(server);
let connected = false;

io.on('connection', (socket) => {
    let ssh = new SSHClient();
    ssh.on('ready', () => {
        socket.emit('data', '\r\n*** SSH CONNECTION ESTABLISHED ***\r\n');
        connected = true;
        ssh.shell((err, stream) => {

            if (err) {
                socket.emit('data', '\r\n*** SSH SHELL ERROR: ' + err.message + ' ***\r\n');
                return;
            }

            socket.on('data', (data) => {
                stream.write(data);
            });

            stream.on('data', (data) => {
                let buffer = utf8.decode(data.toString('binary'))
                console.log('message:', buffer);
                socket.emit('data', buffer);
            });

            stream.on('close', () => {
                ssh.end();
            });
        });
    });

    ssh.on('close', () => {
        socket.emit('data', '\r\n*** SSH CONNECTION CLOSED ***\r\n');
    });

    ssh.on('error', (err) => {
        console.log(err);
        socket.emit('data', '\r\n*** SSH CONNECTION ERROR: ' + err.message + ' ***\r\n');
    });

    ssh.connect(sshConfig);

});


server.listen(8080, () => {
    console.log("Server is started on localhost:8080");
});
