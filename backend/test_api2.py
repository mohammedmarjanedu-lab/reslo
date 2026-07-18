import json, urllib.request

body = json.dumps({
    "geometry": {
        "vertices": [{"x":0,"y":0},{"x":4,"y":0},{"x":4,"y":4},{"x":0,"y":4}],
        "walls": [
            {"startPoint":{"x":0,"y":0},"endPoint":{"x":4,"y":0}},
            {"startPoint":{"x":4,"y":0},"endPoint":{"x":4,"y":4}},
            {"startPoint":{"x":0,"y":0},"endPoint":{"x":0,"y":4}},
            {"startPoint":{"x":0,"y":4},"endPoint":{"x":4,"y":4}}
        ]
    },
    "meshSize": 0.3
}).encode()

r = urllib.request.Request("http://localhost:8000/api/mesh", data=body,
    headers={"Content-Type": "application/json"}, method="POST")
resp = urllib.request.urlopen(r)
data = json.loads(resp.read())
print(json.dumps(data, indent=2))
