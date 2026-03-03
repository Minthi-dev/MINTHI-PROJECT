-- Re-apply admin credentials (new timestamp to force re-execution)
-- username: admin  |  password: minthi2026!

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE role = 'ADMIN') THEN
    UPDATE public.users
    SET
      name          = 'admin',
      username      = 'admin',
      password_hash = '$2b$10$Rt2P98LPOEpWoWdUMxo/YO/jVEfkxvLr85/RuZqjOxGfg56RC4Kfm',
      raw_password  = 'minthi2026!'
    WHERE role = 'ADMIN';
  ELSE
    INSERT INTO public.users (email, name, username, password_hash, raw_password, role)
    VALUES (
      'admin@minthi.it',
      'admin',
      'admin',
      '$2b$10$Rt2P98LPOEpWoWdUMxo/YO/jVEfkxvLr85/RuZqjOxGfg56RC4Kfm',
      'minthi2026!',
      'ADMIN'
    );
  END IF;
END;
$$;
