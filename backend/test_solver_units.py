import numpy as np
from mesher import generate_mesh
from models import MeshRequest, SlabGeometry, WallSupport, Point2D, AnalysisRequest, ColumnSupport, BeamDef
from solver import analyze_slab

def test_simply_supported_square_plate():
    # 4m x 4m square slab
    vertices = [Point2D(x=0, y=0), Point2D(x=4, y=0), Point2D(x=4, y=4), Point2D(x=0, y=4)]
    walls = [
        WallSupport(startPoint=Point2D(x=0, y=0), endPoint=Point2D(x=4, y=0)),
        WallSupport(startPoint=Point2D(x=4, y=0), endPoint=Point2D(x=4, y=4)),
        WallSupport(startPoint=Point2D(x=4, y=4), endPoint=Point2D(x=0, y=4)),
        WallSupport(startPoint=Point2D(x=0, y=4), endPoint=Point2D(x=0, y=0))
    ]
    
    mesh_req = MeshRequest(
        geometry=SlabGeometry(vertices=vertices, walls=walls),
        meshSize=1.0 # 4x4 elements
    )
    
    mesh = generate_mesh(mesh_req)
    print(f"\n--- Simply Supported Square Plate ---")
    print(f"Generated mesh: {mesh.nodeCount} nodes, {len(mesh.elements)} elements")
    
    # Boundary nodes
    tol = 0.01
    wall_node_ids = []
    for i, n in enumerate(mesh.nodes):
        nid = i + 1
        if abs(n.y) < tol or abs(n.y - 4) < tol or abs(n.x) < tol or abs(n.x - 4) < tol:
            wall_node_ids.append(nid)
            
    # Run analysis (simply supported, no wall rotational stiffness)
    analysis_req = AnalysisRequest(
        mesh=mesh,
        thickness=0.2,
        elasticModulus=25e9, # Pa
        poissonRatio=0.2,
        uniformLoad=5.0, # kN/m2
        selfWeight=0.0,
        wallNodeIds=wall_node_ids,
        columnNodeIds=[],
        columnHeights=[],
        columnStiffnesses=[],
        columnWidths=[],
        columnDepths=[],
        beamNodeIdA=[],
        beamNodeIdB=[],
        beamWidths=[],
        beamDepths=[],
        beamElasticModuli=[]
    )
    
    response = analyze_slab(analysis_req)
    assert response.success, f"Analysis failed: {response.error}"
    print(f"Simply Supported Max deflection: {response.maxWz * 1000:.6f} mm")
    
    E = 25e9
    nu = 0.2
    t = 0.2
    D = E * t**3 / (12 * (1 - nu**2))
    q = 5.0 * 1000.0
    side = 4.0
    alpha = 0.00425
    w_exact = alpha * q * side**4 / D
    error_w = abs(response.maxWz - w_exact) / w_exact
    print(f"Timoshenko Exact w_max: {w_exact * 1000:.6f} mm, Error: {error_w * 100:.2f}%")


def test_square_plate_with_wall_springs():
    # 4m x 4m square slab
    vertices = [Point2D(x=0, y=0), Point2D(x=4, y=0), Point2D(x=4, y=4), Point2D(x=0, y=4)]
    walls = [
        WallSupport(startPoint=Point2D(x=0, y=0), endPoint=Point2D(x=4, y=0), thickness=0.3, height=3.0),
        WallSupport(startPoint=Point2D(x=4, y=0), endPoint=Point2D(x=4, y=4), thickness=0.3, height=3.0),
        WallSupport(startPoint=Point2D(x=4, y=4), endPoint=Point2D(x=0, y=4), thickness=0.3, height=3.0),
        WallSupport(startPoint=Point2D(x=0, y=4), endPoint=Point2D(x=0, y=0), thickness=0.3, height=3.0)
    ]
    
    mesh_req = MeshRequest(
        geometry=SlabGeometry(vertices=vertices, walls=walls),
        meshSize=1.0 # 4x4 elements
    )
    
    mesh = generate_mesh(mesh_req)
    print(f"\n--- Slab with Semi-Rigid Walls (Rotational Springs) ---")
    
    # Boundary nodes
    tol = 0.01
    wall_node_ids = []
    for i, n in enumerate(mesh.nodes):
        nid = i + 1
        if abs(n.y) < tol or abs(n.y - 4) < tol or abs(n.x) < tol or abs(n.x - 4) < tol:
            wall_node_ids.append(nid)
            
    # Run analysis (with wall rotational stiffness)
    analysis_req = AnalysisRequest(
        mesh=mesh,
        thickness=0.2,
        elasticModulus=25e9, # Pa
        poissonRatio=0.2,
        uniformLoad=5.0, # kN/m2
        selfWeight=0.0,
        wallNodeIds=wall_node_ids,
        wallStartPoints=[w.startPoint for w in walls],
        wallEndPoints=[w.endPoint for w in walls],
        wallThicknesses=[w.thickness for w in walls],
        wallHeights=[w.height for w in walls],
        columnNodeIds=[],
        columnHeights=[],
        columnStiffnesses=[],
        columnWidths=[],
        columnDepths=[],
        beamNodeIdA=[],
        beamNodeIdB=[],
        beamWidths=[],
        beamDepths=[],
        beamElasticModuli=[]
    )
    
    response = analyze_slab(analysis_req)
    assert response.success, f"Analysis failed: {response.error}"
    print(f"Semi-Rigid Walls (t=0.3m) Max deflection: {response.maxWz * 1000:.6f} mm")


def test_square_plate_with_beams():
    # 4m x 4m square slab supported by 4 corner columns and edge beams
    vertices = [Point2D(x=0, y=0), Point2D(x=4, y=0), Point2D(x=4, y=4), Point2D(x=0, y=4)]
    columns = [
        ColumnSupport(position=Point2D(x=0, y=0), width=0.3, depth=0.3, height=3.0),
        ColumnSupport(position=Point2D(x=4, y=0), width=0.3, depth=0.3, height=3.0),
        ColumnSupport(position=Point2D(x=4, y=4), width=0.3, depth=0.3, height=3.0),
        ColumnSupport(position=Point2D(x=0, y=4), width=0.3, depth=0.3, height=3.0)
    ]
    beams = [
        BeamDef(startPoint=Point2D(x=0, y=0), endPoint=Point2D(x=4, y=0)),
        BeamDef(startPoint=Point2D(x=4, y=0), endPoint=Point2D(x=4, y=4)),
        BeamDef(startPoint=Point2D(x=4, y=4), endPoint=Point2D(x=0, y=4)),
        BeamDef(startPoint=Point2D(x=0, y=4), endPoint=Point2D(x=0, y=0))
    ]
    
    mesh_req = MeshRequest(
        geometry=SlabGeometry(vertices=vertices, columns=columns, beams=beams),
        meshSize=1.0
    )
    
    mesh = generate_mesh(mesh_req)
    print(f"\n--- Slab with Columns & Edge Beams ---")
    print(f"Generated mesh: {mesh.nodeCount} nodes, {len(mesh.elements)} elements")
    
    # Identify column nodes (nearest node to column position)
    col_node_ids = []
    col_stiff = []
    for col in columns:
        best_nid = 1
        best_dist = 999.0
        for i, n in enumerate(mesh.nodes):
            d = np.hypot(n.x - col.position.x, n.y - col.position.y)
            if d < best_dist:
                best_dist = d
                best_nid = i + 1
        col_node_ids.append(best_nid)
        col_stiff.append(4 * 25e9 * (0.3 * 0.3**3 / 12) / 3.0) # 4EI/H
        
    # Map beam endpoints to mesh nodes
    beamNodeIdA = []
    beamNodeIdB = []
    beamWidths = []
    beamDepths = []
    beamElasticModuli = []
    
    for beam in beams:
        bestA_nid = 1
        bestA_dist = 999.0
        bestB_nid = 1
        bestB_dist = 999.0
        for i, n in enumerate(mesh.nodes):
            dA = np.hypot(n.x - beam.startPoint.x, n.y - beam.startPoint.y)
            dB = np.hypot(n.x - beam.endPoint.x, n.y - beam.endPoint.y)
            if dA < bestA_dist:
                bestA_dist = dA
                bestA_nid = i + 1
            if dB < bestB_dist:
                bestB_dist = dB
                bestB_nid = i + 1
        beamNodeIdA.append(bestA_nid)
        beamNodeIdB.append(bestB_nid)
        beamWidths.append(0.3)
        beamDepths.append(0.4)
        beamElasticModuli.append(25e9)
        
    analysis_req = AnalysisRequest(
        mesh=mesh,
        thickness=0.2,
        elasticModulus=25e9,
        poissonRatio=0.2,
        uniformLoad=5.0,
        selfWeight=0.0,
        wallNodeIds=[],
        columnNodeIds=col_node_ids,
        columnHeights=[3.0] * 4,
        columnStiffnesses=col_stiff,
        columnWidths=[0.3] * 4,
        columnDepths=[0.3] * 4,
        beamNodeIdA=beamNodeIdA,
        beamNodeIdB=beamNodeIdB,
        beamWidths=beamWidths,
        beamDepths=beamDepths,
        beamElasticModuli=beamElasticModuli
    )
    
    response = analyze_slab(analysis_req)
    assert response.success, f"Analysis failed: {response.error}"
    print(f"Columns & Edge Beams Max deflection: {response.maxWz * 1000:.6f} mm")
    
if __name__ == "__main__":
    test_simply_supported_square_plate()
    test_square_plate_with_wall_springs()
    test_square_plate_with_beams()
