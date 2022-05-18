
const createForm = document.querySelector(".create-form");
const createStatusMessage = document.querySelector('.create-status-message');

createForm.addEventListener('submit', (e) => {
    e.preventDefault();

    sendData();
})

function sendData()
{
    const name = document.querySelector('.create-username-box-holder input').value;
    const about = document.querySelector(".create-password-box-holder input").value;

    fetch("/details", {
        method: 'POST',
        redirect: 'follow',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: name,
            about: about,
        })
    })
        .then(res => res.json())
        .then(data => {
            if(data.code === "FAIL")
            {
                createStatusMessage.innerText = "Something went wrong😢😢";
            }
            else if(data.code === "SUCCESS"){
                createStatusMessage.innerText = "Redirecting...";
                document.location.replace(document.location.origin+"/login");
            }
        })
}