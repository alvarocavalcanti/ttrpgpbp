with open('supabase/tests/20260819130000_abuse_controls.sql', 'r') as f:
    c = f.read()
c = c.replace(r'{\"success\": false, \"error\": \"Invalid password or invite code\"}', '{"success": false, "error": "Invalid password or invite code"}')
with open('supabase/tests/20260819130000_abuse_controls.sql', 'w') as f:
    f.write(c)
