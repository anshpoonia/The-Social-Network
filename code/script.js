const createForm = document.querySelector(".create-form");
const createStatusMessage = document.querySelector(".create-status-message");

createForm.addEventListener('submit', (e) => {
    e.preventDefault();

    sendData();
})

function sendData()
{
    const code = document.querySelector('.create-username-box-holder input').value;
    fetch("/code", {
        method: 'POST',
        redirect: 'follow',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            code: code,
        })
    })
        .then(res => res.json())
        .then(data => {
            if(data.code === "FAIL")
            {
                createStatusMessage.innerText = "Entered verification code is wrong"
            }
            else if(data.code === "SUCCESS") {
                createStatusMessage.innerText = "Redirecting..."
                document.location.replace(document.location.origin + "/details")

            }
        })
}