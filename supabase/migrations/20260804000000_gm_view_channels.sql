CREATE POLICY "GMs can view own channels" 
  ON channels FOR SELECT USING (auth.uid() = gm_id);
