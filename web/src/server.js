let sessions = [];
let links = {};

const CODE_LENGTH = 4;

function generateCode() {
    return (Math.random() * 10000).toFixed(0).padStart(CODE_LENGTH, '0');
    //return Math.random().toString(36).substring(2, 2 + CODE_LENGTH).toUpperCase();
}

function handleConnection(client, request) {
    const headers = request.headers;
    const ip = headers['cf-connecting-ip'] || headers['x-forwarded-for'] || request.connection.remoteAddress;
    const sessionID = headers.cookie.split('sessionID=')[1];
    let session = sessions.find(session => session.id == sessionID);

    if (session) console.log(session.client.readyState)

    if (session) {
        if (session.client.readyState != 3) session.client.close();
        session.client = client;

        switch (session.role) {
            case "presenter":
                session.client.send(JSON.stringify({
                    type: "reconnect",
                    role: "presenter"
                }));

                session.link.presenter = session;
                break;

            case "helper":
                session.client.send(JSON.stringify({
                    type: "reconnect",
                    role: "helper"
                }));

                session.link.helper = session;
                break;
        }
    } else {
        session = {
            id: sessionID,
            ip: ip,
            client: client
        }
    }

    sessions.push(session);

    function onClose() {
        console.log(`Connection Closed`);
    }

    function onMessage(data) {
        if (data.indexOf("keepalive") == 0) {
            const count = data.split("/")[1];

            if (isNaN(parseInt(count))) throw Error("Invalid Keepalive");
            return;
        }

        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case "init_link":
                    {
                        let code = null;
                        let maxTries = 100;

                        while (links[code] || !code) {
                            code = generateCode();

                            if (maxTries-- == 0) {
                                throw Error("Failed to generate link code / Exhaused all available codes");
                            }
                        }

                        session.role = "presenter";

                        const link = {
                            presenter: session,
                            helper: null,

                            code: code
                        }

                        session.link = link;
                        links[code] = link;

                        session.client.send(JSON.stringify({
                            type: "init_link",
                            code: code
                        }));
                    }
                    break;

                case "link":
                    {
                        const code = message.code;
                        const link = links[code];

                        if (!link) {
                            session.client.send(JSON.stringify({
                                type: "link",
                                message: "not_found",
                                code: code
                            }));
                            return;
                        }

                        if (link.helper) {
                            session.client.send(JSON.stringify({
                                type: "link",
                                message: "already_linked",
                                code: code
                            }));
                            return;
                        }

                        session.role = "helper";
                        session.link = link;

                        link.helper = session;

                        session.client.send(JSON.stringify({
                            type: "link",
                            message: "linked",
                            role: "helper",
                            code: code
                        }));

                        link.presenter.client.send(JSON.stringify({
                            type: "link",
                            message: "linked",
                            role: "presenter",
                            code: code
                        }));
                    }
                    break;

                case "gyro":
                    if (session.role != "helper") {
                        session.client.send(JSON.stringify({
                            type: "gyro",
                            message: "not_helper"
                        }));
                        return;
                    }

                    if (!session.link) {
                        session.client.send(JSON.stringify({
                            type: "gyro",
                            message: "not_linked"
                        }));
                        return;
                    }

                    session.link.presenter.client.send(JSON.stringify({
                        type: "gyro",
                        data: message.data
                    }));
                    break;


                default:
                    console.log(`Unknown message type: ${message.type}`);
                    console.log(`Raw message: ${data}`);
            }
        } catch (error) {
            console.log(error);
            return;
        }
    }

    client.on('message', data => {
        try {
            onMessage(data.toString())
        } catch (error) {
            client.close();
            console.log(error)
        }
    });

    client.on('close', onClose);
}

module.exports = handleConnection;