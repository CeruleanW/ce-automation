# Supabase schema reference

Context-only snapshot of the Supabase tables used by CE automation. This is not a migration and should not be executed as-is; table order and constraints may need adjustment.

```sql

CREATE TABLE public.course (
  term_id uuid,
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  title text NOT NULL,
  description text,
  CONSTRAINT course_pkey PRIMARY KEY (id),
  CONSTRAINT course_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(id)
);
CREATE TABLE public.file_document (
  lesson_id uuid,
  link text NOT NULL,
  title text NOT NULL,
  file_type USER-DEFINED NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  CONSTRAINT file_document_pkey PRIMARY KEY (id),
  CONSTRAINT file_document_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lesson(id)
);
CREATE TABLE public.lesson (
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  order_index integer,
  title text,
  subtitle text,
  content text,
  course_id uuid,
  CONSTRAINT lesson_pkey PRIMARY KEY (id),
  CONSTRAINT lesson_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.course(id)
);
CREATE TABLE public.news (
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  content text NOT NULL,
  date date NOT NULL,
  form_link text,
  title text,
  CONSTRAINT news_pkey PRIMARY KEY (id)
);
CREATE TABLE public.term (
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  name character varying NOT NULL,
  end_year integer NOT NULL,
  end_month integer NOT NULL,
  start_year integer NOT NULL,
  start_month integer NOT NULL,
  CONSTRAINT term_pkey PRIMARY KEY (id)
);
```
