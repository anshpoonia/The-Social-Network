document.addEventListener("DOMContentLoaded", () =>
{
    const pictureURL = "https://ansh-poonia.github.io/profile-pictures/profile%20pictures/";
    const userProfileName = document.querySelector(".user-profile-name");
    const userProfilePicture = document.querySelector(".user-profile-picture");
    const newChatButton = document.querySelector('.new-chat-button-holder');
    const mainBodyHolder = document.querySelector('.main-body-holder');
    const inbox = document.querySelector('.inbox .container');
    const logoutButton = document.querySelector('#logout-button');
    let searchButton = null;
    let userDetails = null;
    let WEBSOCKET = null;
    let messageWindow = null;

    logoutButton.addEventListener('click', logout);

    getUserDetails();

    class Message
    {
        constructor(selector) {
            this.holder = document.querySelector(selector);
        }

        add(message)
        {
            let class1 = message.from === userDetails.username? "chat-sent-holder":"chat-received-holder";
            let class2 = message.from === userDetails.username? "chat-sent":"chat-received";
            if(message.type === 1)
            {
                class1 = "chat-announcement-holder";
                class2 = "chat-announcement";

            }
            const div = document.createElement('div');
            div.innerHTML = `<div class=${class1}>
                            <div class=${class2}>
                                ${message.data}
                            </div>
                        </div>`
            this.holder.innerHTML = div.innerHTML + this.holder.innerHTML;
        }
    }

    function getUserDetails()
    {
        fetch("/user", {
            method: 'POST',
            redirect: 'follow',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
        })
            .then(res => res.json())
            .then(data => {
                if(data.code === "FAIL")
                {
                    document.location.replace(document.location.origin + "/login/");
                }
                else
                {
                    userDetails = data;
                    renderUserDetails();
                    connectWebSocket();
                }
            })
    }

    function renderUserDetails()
    {
        userProfilePicture.style.backgroundImage = `url('${pictureURL+userDetails.imageCode+".png"}')`;
        userProfileName.innerText = userDetails.name;
    }

    function connectWebSocket()
    {
        WEBSOCKET = new WebSocket(window.location.origin.replace(/^http/, 'ws'));

        WEBSOCKET.onopen = () => {
            console.log("-**- Websocket is connected -**-");
            WEBSOCKET.send(JSON.stringify([8, getSessionToken()]));

            newChatButton.addEventListener('click', openSearchWindow);

        };

        WEBSOCKET.onclose = () => {
            console.log("-**- Websocket is disconnected -**-");
        }

        WEBSOCKET.onmessage = (ev) => {
            console.log(ev);
            const message = JSON.parse(ev.data);
            const CODE = message[0];
            console.log(message);


            if(CODE === 4)
            {
                const data = message[1];

                document.querySelector(".user-search-list").innerHTML = "";
                if(data.length !== 0)
                {

                    data.forEach(value => {
                        const div = document.createElement('div');
                        div.innerHTML = `<div class="search-user-holder">
                            <div class="search-profile-picture">
                                <img src="${pictureURL+value.imageCode+".png"}">
                            </div>
                            <div class="search-user-details">
                                <div class="search-user-name">${value.name}</div>
                                <div class="search-username">@${value.username}</div>
                            </div>
                        </div>`
                        div.addEventListener('dblclick', () => addFriend(value.username));
                        document.querySelector(".user-search-list").appendChild(div);
                    })
                }
                else
                {
                    document.querySelector(".user-search-list").textContent = "No user found";
                }

            }
            else if(CODE === 1)
            {
                userDetails.friends = message[1];
                renderInbox();
            }
            else if(CODE === 8)
            {
                WEBSOCKET.send(JSON.stringify([1]));
            }
            else if(CODE === 2)
            {
                const chats = message[2];
                userDetails.windowname = message[1];
                renderChatWindow(chats, message[1]);

            }
            else if(CODE === 3)
            {
                if(userDetails.windowname === message[1])
                    messageWindow.add(message[2]);
            }
            else if(CODE === 5)
            {
                WEBSOCKET.send(JSON.stringify([1]));
            }

        }
    }

    function renderChatWindow(chats, username)
    {
        document.querySelector('.chat-window-holder').innerHTML = "";
        let user = null;
        userDetails.friends.forEach(value => {
            if(value.username === username) user = value;
        });
        const div = document.createElement('div');
        div.innerHTML = `<div class="chat-window">

                    <div class="chat-top-bar">

                        <div class="chat-top-user-picture"><img src="${pictureURL+user.imageCode+".png"}"></div>

                        <div class="chat-top-details-holder">
                            <div class="chat-top-name">
                                ${user.name}
                            </div>
                            <div class="chat-top-username">
                                @${user.username}
                            </div>
                        </div>

                        

                    </div>

                    <div class="chat-message-holder">

                    </div>

                    <div class="chat-box-holder">

                        <div class="chat-box-inner-holder">

                            <input class="chat-box" placeholder="Type Something..." type="text">

                            <button class="send-button">Send</button>

                        </div>

                    </div>
                </div>`
        document.querySelector('.chat-window-holder').appendChild(div);

        messageWindow = new Message(".chat-message-holder");

        chats.forEach(value => {
            messageWindow.add(value);
        })
        document.querySelector('.send-button').addEventListener('click', sendMessage);
        renderInbox();
    }

    function sendMessage()
    {
        const chatBox = document.querySelector('.chat-box');
        const temp = {
            id: new Date().getTime(),
            from: userDetails.username,
            data: chatBox.value,
            type: 2
        }
        messageWindow.add(temp);
        chatBox.value = "";
        WEBSOCKET.send(JSON.stringify([3, userDetails.windowname, temp]));
    }

    function renderInbox()
    {
        inbox.innerHTML = "";
        userDetails.friends.forEach(value => {

            const div = document.createElement("div");
            const class1 = value.username === userDetails.windowname? " inbox-selected inbox-user-holder": "inbox-user-holder";
            div.innerHTML = `<div class="${class1}">
                            <div class="profile-picture">
                                <img src=${pictureURL+value.imageCode+".png"}>
                            </div>
                            <div class="user-details">
                                <div class="user-name">${value.name}</div>
                                <div class="inbox-username">@${value.username}</div>
                                <div className="inbox-notification-marker"></div>
                            </div>
                        </div>`
            div.addEventListener('click', () => openChatBox(value.username));
            inbox.appendChild(div);
        })
    }

    function openChatBox(username)
    {
        WEBSOCKET.send(JSON.stringify([2, username]));
    }

    function addFriend(username)
    {
        WEBSOCKET.send(JSON.stringify([5, username]));
        closeSearchWindow();
    }

    function openSearchWindow()
    {
        console.log("opened")
        const div = document.createElement('div');
        div.innerHTML = "    <div class='new-chat-search-holder'><input class=\"new-chat-search-input\" type=\"text\">\n" +
            "    <button class=\"new-chat-search-button\" type=\"button\">Search</button></div>\n" +
            "    <div class=\"user-search-list\">\n" +
            "\n" +
            "    </div>"
        div.classList.add('new-chat-search-window');
        mainBodyHolder.classList.add('blurred-window');
        // mainBodyHolder.addEventListener('click', closeSearchWindow);
        document.querySelector('body').appendChild(div);

        searchButton = document.querySelector('.new-chat-search-button');
        searchButton.addEventListener('click', sendSearchQuery);
    }

    function closeSearchWindow()
    {
        console.log("closed")
        mainBodyHolder.classList.remove('blurred-window');
        document.querySelector('.new-chat-search-window').remove();
    }

    function sendSearchQuery()
    {
        const query = document.querySelector('.new-chat-search-input').value;
        WEBSOCKET.send(JSON.stringify([4, query]));
    }


    function getSessionToken()
    {
        const cookieName = "session=";
        const cookies = document.cookie;
        const arr = cookies.split(';');

        for(let i = 0; i < arr.length; i++)
        {
            let c = arr[i];
            while (c.charAt(0) === ' ') c = c.substring(1);
            if (c.indexOf(cookieName) === 0) return c.substring(cookieName.length, c.length);
        }
    }

    function logout()
    {
        fetch("/logout", {
            method: 'POST',
            redirect: 'follow',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
        })
            .then(res => res.json())
            .then(data => {
                document.location.replace(document.location.origin + "/login/");
            })
    }

});