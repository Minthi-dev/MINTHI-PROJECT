-- Fix/create admin user with correct bcrypt credentials
-- username: admin  |  password: minthi2026!
-- If an ADMIN user already exists, update their credentials.
-- If none exists, create one.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE role = 'ADMIN') THEN
    UPDATE public.users
    SET
      name         = 'admin',
      username     = 'admin',
      password_hash = '$2b$10$TC569hwahfa4JqlAwRcKu.gKQOoPY4gc7V5G/rs/h18IMOUn5zks2',
      raw_password  = 'minthi2026!'
    WHERE role = 'ADMIN';
  ELSE
    INSERT INTO public.users (email, name, username, password_hash, raw_password, role)
    VALUES (
      'admin@minthi.it',
      'admin',
      'admin',
      '$2b$10$TC569hwahfa4JqlAwRcKu.gKQOoPY4gc7V5G/rs/h18IMOUn5zks2',
      'minthi2026!',
      'ADMIN'
    );
  END IF;
END;
$$;
