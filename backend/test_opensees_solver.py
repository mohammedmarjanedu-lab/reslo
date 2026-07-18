import numpy as np
from mesher import generate_mesh
from models import MeshRequest, SlabGeometry, WallSupport, Point2D, AnalysisRequest, ColumnSupport, BeamDef
from solver import analyze_slab
from opensees_solver import analyze_slab_opensees

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
        meshSize=0.5 # relatively fine mesh
    )
    mesh = generate_mesh(mesh_req)
    
    # Boundary nodes
    tol = 0.01
    wall_node_ids = []
    for i, n in enumerate(mesh.nodes):
        nid = i + 1
        if abs(n.y) < tol or abs(n.y - 4) < tol or abs(n.x) < tol or abs(n.x - 4) < tol:
            wall_node_ids.append(nid)
            
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
    
    res_custom = analyze_slab(analysis_req)
    res_ops = analyze_slab_opensees(analysis_req)
    
    assert res_custom.success, "Custom solver failed"
    assert res_ops.success, f"OpenSees solver failed: {res_ops.error}"
    
    # Check deflections
    wz_custom = {d.nodeId: d.wz for d in res_custom.nodeDeflections}
    wz_ops = {d.nodeId: d.wz for d in res_ops.nodeDeflections}
    
    max_w_custom = max(wz_custom.values())
    max_w_ops = max(wz_ops.values())
    
    print(f"\nSS Max wz Custom: {max_w_custom*1000:.6f} mm, OpenSees: {max_w_ops*1000:.6f} mm")
    # Verify deflection matches within 2%
    assert abs(max_w_custom - max_w_ops) / max_w_custom < 0.02
    
    # Verify moments match within 3%
    max_mx_custom = max(abs(m.mx) for m in res_custom.elementMoments)
    max_mx_ops = max(abs(m.mx) for m in res_ops.elementMoments)
    print(f"SS Max Mx Custom: {max_mx_custom:.2f}, OpenSees: {max_mx_ops:.2f}")
    assert abs(max_mx_custom - max_mx_ops) / max_mx_custom < 0.03


def test_square_plate_with_beams_and_columns():
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
    
    res_custom = analyze_slab(analysis_req)
    res_ops = analyze_slab_opensees(analysis_req)
    
    assert res_custom.success, "Custom solver failed"
    assert res_ops.success, f"OpenSees solver failed: {res_ops.error}"
    
    # Check deflections
    wz_custom = {d.nodeId: d.wz for d in res_custom.nodeDeflections}
    wz_ops = {d.nodeId: d.wz for d in res_ops.nodeDeflections}
    
    max_w_custom = max(wz_custom.values())
    max_w_ops = max(wz_ops.values())
    
    print(f"\nBeam-Col Max wz Custom: {max_w_custom*1000:.6f} mm, OpenSees: {max_w_ops*1000:.6f} mm")
    
    # The meshed beam elements in OpenSees provide continuous support to the slab along the span,
    # so OpenSees deflection should be significantly smaller than the unmeshed custom baseline.
    assert max_w_ops < max_w_custom
    # Confirm it is within the expected physical range (0.4mm to 0.8mm)
    assert 0.4e-3 < max_w_ops < 0.8e-3


def test_floating_and_disconnected_elements():
    # Define a 4m x 4m square slab supported by corner columns,
    # but we add an isolated node (outside), a floating beam segment,
    # and a completely unsupported wall to test solver robustness.
    vertices = [Point2D(x=0, y=0), Point2D(x=4, y=0), Point2D(x=4, y=4), Point2D(x=0, y=4)]
    columns = [
        ColumnSupport(position=Point2D(x=0, y=0), width=0.3, depth=0.3, height=3.0),
        ColumnSupport(position=Point2D(x=4, y=0), width=0.3, depth=0.3, height=3.0)
    ]
    # Beam completely outside the slab (from x=5 to x=7)
    beams = [
        BeamDef(startPoint=Point2D(x=5, y=0), endPoint=Point2D(x=7, y=0))
    ]
    
    mesh_req = MeshRequest(
        geometry=SlabGeometry(vertices=vertices, columns=columns, beams=beams),
        meshSize=1.0
    )
    mesh = generate_mesh(mesh_req)
    
    # Verify unconnectedNodeIds is calculated
    assert len(mesh.unconnectedNodeIds) > 0, "Unconnected nodes should be detected"
    print(f"\nDetected {len(mesh.unconnectedNodeIds)} unconnected nodes in mesh.")
    
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
        col_stiff.append(4 * 25e9 * (0.3 * 0.3**3 / 12) / 3.0)
        
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
        columnHeights=[3.0] * 2,
        columnStiffnesses=col_stiff,
        columnWidths=[0.3] * 2,
        columnDepths=[0.3] * 2,
        beamNodeIdA=beamNodeIdA,
        beamNodeIdB=beamNodeIdB,
        beamWidths=beamWidths,
        beamDepths=beamDepths,
        beamElasticModuli=beamElasticModuli
    )
    
    # This should analyze successfully without singular matrix error!
    res_ops = analyze_slab_opensees(analysis_req)
    assert res_ops.success, f"OpenSees failed to handle disconnected model: {res_ops.error}"
    print("OpenSees successfully solved unstable model by stabilizing floating components!")
