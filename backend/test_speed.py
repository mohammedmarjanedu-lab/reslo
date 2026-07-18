import json, urllib.request, time

body = json.dumps({
    'geometry': {
        'vertices': [{'x':0,'y':0},{'x':6,'y':0},{'x':6,'y':6},{'x':0,'y':6}],
        'walls': [{'startPoint':{'x':0,'y':0},'endPoint':{'x':6,'y':0}}]
    },
    'meshSize': 0.3
}).encode()

t0 = time.time()
r = urllib.request.Request('http://localhost:8000/api/mesh', data=body, headers={'Content-Type': 'application/json'}, method='POST')
resp = urllib.request.urlopen(r)
mesh = json.loads(resp.read())['mesh']
t_mesh = time.time() - t0
print(f"Mesh generated in {t_mesh:.3f}s: {mesh['nodeCount']} nodes, {len(mesh['elements'])} elements")

ar_body = json.dumps({
    'mesh': mesh, 'thickness': 0.2, 'elasticModulus': 25e9, 'poissonRatio': 0.2,
    'uniformLoad': 5.0, 'selfWeight': 5.0,
    'wallNodeIds': [1,2,3,4,5], 'columnNodeIds': [50],
    'columnHeights': [3.0], 'columnElasticModuli': [25e9], 'columnMomentsInertia': [0.000675],
    'columnWidths': [0.3], 'columnDepths': [0.3], 'columnShapes': ['rectangular'], 'columnDiameters': [0.5]
}).encode()

t1 = time.time()
r2 = urllib.request.Request('http://localhost:8000/api/analyze', data=ar_body, headers={'Content-Type': 'application/json'}, method='POST')
resp2 = urllib.request.urlopen(r2)
res = json.loads(resp2.read())
t_analyze = time.time() - t1
print(f"Analyze completed in {t_analyze:.3f}s: success={res.get('success')} error={res.get('error')}")
