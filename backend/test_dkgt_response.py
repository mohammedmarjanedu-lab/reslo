import openseespy.opensees as ops

ops.wipe()
ops.model('basic', '-ndm', 3, '-ndf', 6)

ops.node(1, 0.0, 0.0, 0.0)
ops.node(2, 1.0, 0.0, 0.0)
ops.node(3, 0.0, 1.0, 0.0)

ops.fix(1, 1, 1, 1, 1, 1, 1) # Wait, 6 DOFs after node tag: node, u1, u2, u3, r1, r2, r3
ops.fix(2, 1, 1, 1, 1, 1, 1)

E = 27.386e9 * 0.25 # Pa
nu = 0.16
h = 0.2 # m

ops.section('ElasticMembranePlateSection', 1, E, nu, h, 0.0)
ops.element('ShellDKGT', 1, 1, 2, 3, 1)

ops.timeSeries('Linear', 1)
ops.pattern('Plain', 1, 1)
ops.load(3, 0.0, 0.0, -10000.0, 0.0, 0.0, 0.0)

ops.constraints('Transformation')
ops.numberer('RCM')
ops.system('SparseGeneral')
ops.algorithm('Linear')
ops.integrator('LoadControl', 1.0)
ops.analysis('Static')
ops.analyze(1)

print("--- eleResponse keys ---")
for key in ['forces', 'stresses', 'section.force', 'section.stresses']:
    try:
        resp = ops.eleResponse(1, key)
        print(f"Key '{key}': len={len(resp) if resp else 0}, data={resp}")
    except Exception as e:
        print(f"Key '{key}': Error ({e})")
