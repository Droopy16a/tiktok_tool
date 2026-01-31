import requests

url = 'http://127.0.0.1:8000/api/tts'
myobj = {'text': 'I like chocolate like a giant bitch...'}

x = requests.post(url, json = myobj)

print(x.text)