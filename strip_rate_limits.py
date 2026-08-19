import sys

def process_130000():
    with open('supabase/migrations/20260819130000_abuse_controls.sql', 'r') as f:
        content = f.read()
    
    # 1. Remove Section 3 completely
    start_str = '-- ==========================================\n-- 3. Rate Limiting (Token Bucket)\n-- =========================================='
    end_str = '-- Update join_channel to throttle failed password attempts'
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str)
    
    if start_idx == -1 or end_idx == -1:
        print("Could not find section 3 in 130000")
        sys.exit(1)
        
    new_content = content[:start_idx] + content[end_idx:]
    
    # 2. Remove check_rate_limit from join_channel
    target = """    -- They are attempting a password. Enforce a strict rate limit for password guesses.
    IF NOT check_rate_limit(auth.uid(), 'password_attempt', 5, 1) THEN
      RAISE EXCEPTION 'Rate limit exceeded for password attempts. Please wait and try again.';
    END IF;"""
    
    new_content = new_content.replace(target, '')
    
    with open('supabase/migrations/20260819130000_abuse_controls.sql', 'w') as f:
        f.write(new_content)
    print("Updated 130000")

def process_140000():
    with open('supabase/migrations/20260819140000_join_channel_return_json.sql', 'r') as f:
        content = f.read()
        
    target = """    -- They are attempting a password. Enforce a strict rate limit for password guesses.
    IF NOT check_rate_limit(auth.uid(), 'password_attempt', 5, 1) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Rate limit exceeded for password attempts. Please wait and try again.');
    END IF;"""
    
    new_content = content.replace(target, '')
    
    with open('supabase/migrations/20260819140000_join_channel_return_json.sql', 'w') as f:
        f.write(new_content)
    print("Updated 140000")

def process_tests():
    with open('supabase/tests/20260819130000_abuse_controls.sql', 'r') as f:
        content = f.read()
        
    content = content.replace('SELECT plan(8);', 'SELECT plan(2);')
    
    # We want to keep ONLY the suspended test and ONE invalid password test.
    # Actually, if we just remove the 5 rate limit test duplicates and the throws_ok.
    
    # Find the block of multiple Invalid password tests.
    target_multi = """SELECT is(join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong'), '{"success": false, "error": "Invalid password or invite code"}'::jsonb);
SELECT is(join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong'), '{"success": false, "error": "Invalid password or invite code"}'::jsonb);
SELECT is(join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong'), '{"success": false, "error": "Invalid password or invite code"}'::jsonb);
SELECT is(join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong'), '{"success": false, "error": "Invalid password or invite code"}'::jsonb);
SELECT is(join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong'), '{"success": false, "error": "Invalid password or invite code"}'::jsonb);
SELECT is(join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong'), '{"success": false, "error": "Rate limit exceeded for password attempts. Please wait and try again."}'::jsonb);"""
    
    replacement_multi = """SELECT is(join_channel('00000000-0000-0000-0000-000000000210', 'Char', NULL, NULL, 'wrong'), '{"success": false, "error": "Invalid password or invite code"}'::jsonb);"""
    
    content = content.replace(target_multi, replacement_multi)
    
    # Now remove the channel inserts testing rate limit
    target_channels = """INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000211', 'T1', '00000000-0000-0000-0000-000000000209');
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000212', 'T2', '00000000-0000-0000-0000-000000000209');
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000213', 'T3', '00000000-0000-0000-0000-000000000209');
INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000214', 'T4', '00000000-0000-0000-0000-000000000209');
SELECT throws_ok($$ INSERT INTO channels (id, name, gm_id) VALUES ('00000000-0000-0000-0000-000000000215', 'T5', '00000000-0000-0000-0000-000000000209') $$, 'Rate limit exceeded for create_channel');"""
    
    content = content.replace(target_channels, '')
    
    with open('supabase/tests/20260819130000_abuse_controls.sql', 'w') as f:
        f.write(content)
    print("Updated tests")

process_130000()
process_140000()
process_tests()
