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
        
        if (session.link && !links[session.link.code]) {
            return handleConnection(client, request);
        }

        switch (session.role) {
            case "presenter":
                session.client.send(JSON.stringify({
                    type: "reconnect",
                    role: "presenter"
                }));

                session.link.connected.presenter = true;
                session.link.presenter = session;
                break;

            case "helper":
                session.client.send(JSON.stringify({
                    type: "reconnect",
                    role: "helper"
                }));

                session.link.connected.helper = true;
                session.link.helper = session;
                break;
        }
    } else {
        session = {
            id: sessionID,
            ip: ip,
            client: client,
            role: "none"
        }
    }

    sessions.push(session);

    function onClose() {
        console.log(`Connection Closed`);

        if (session.link) {
            if (session.role == "presenter" && session.link.helper?.client) {
                session.link.helper.client.send(JSON.stringify({
                    type: "link",
                    message: "presenter_disconnected"
                }));

                session.link.connected.presenter = false;
            } else {
                session.link.presenter.client.send(JSON.stringify({
                    type: "link",
                    message: "helper_disconnected"
                }));

                session.link.connected.helper = false;
            }

            if (!session.link.connected.presenter && !session.link.connected.helper) {
                delete links[session.link.code];

                const indexPresenter = sessions.indexOf(session.link.presenter);
                sessions.splice(indexPresenter, 1);

                const indexHelper = sessions.indexOf(session.link.helper);
                sessions.splice(indexHelper, 1);
            }
        }
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

                            code: code,
                            connected: {
                                presenter: true,
                                helper: false
                            }
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
                        link.connected.helper = true;

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

                case "click":
                    if (session.role != "helper") {
                        session.client.send(JSON.stringify({
                            type: "click",
                            message: "not_helper"
                        }));
                        return;
                    }

                    if (!session.link) {
                        session.client.send(JSON.stringify({
                            type: "click",
                            message: "not_linked"
                        }));
                        return;
                    }

                    session.link.presenter.client.send(JSON.stringify({
                        type: "click",
                        button: message.button
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