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
mesh = data["mesh"]
print(f"Mesh: {mesh['nodeCount']} nodes, {mesh['elementCount']} elements")

# Find boundary nodes by position (1-indexed)
tol = 0.01
wall_ids = []
for i, n in enumerate(mesh["nodes"]):
    nid = i + 1  # 1-indexed
    if abs(n["y"]) < tol or abs(n["y"] - 4) < tol or abs(n["x"]) < tol or abs(n["x"] - 4) < tol:
        wall_ids.append(nid)

print(f"Wall nodes: {len(wall_ids)} out of {len(mesh['nodes'])}")

ar_body = json.dumps({
    "mesh": mesh, "thickness": 0.2, "elasticModulus": 25e9, "poissonRatio": 0.2,
    "uniformLoad": 5.0, "selfWeight": 0,
    "wallNodeIds": wall_ids, "columnNodeIds": [],
    "columnHeights": [], "columnElasticModuli": [], "columnMomentsInertia": []
}).encode()

r2 = urllib.request.Request("http://localhost:8000/api/analyze", data=ar_body,
    headers={"Content-Type": "application/json"}, method="POST")
resp2 = urllib.request.urlopen(r2)
result = json.loads(resp2.read())
wz = [d["wz"] for d in result["nodeDeflections"]]
print(f"Analysis: w_max={max(wz)*1000:.4f}mm, success={result['success']}")
