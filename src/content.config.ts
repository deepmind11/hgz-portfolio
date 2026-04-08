import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    tagline: z.string(),
    description: z.string(),
    order: z.number(),
    status: z.enum(["shipped", "active", "concept"]),
    featured: z.boolean().default(false),
    github: z.string().url(),
    demo: z.string().url().optional(),
    tech: z.array(z.string()),
    domain: z.array(z.string()),
    targetCompanies: z.array(z.string()),
    image: z.string().optional(),
    started: z.string(),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.string(),
    project: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects, blog };
