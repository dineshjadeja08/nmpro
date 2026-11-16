import type { Metadata } from "next";
import Link from "next/link";
import type { BlogPost } from "@nammapros/types";
import { ContentPage } from "@/components/content-page";
import { ServiceImage } from "@/components/service-image";
import { api } from "@/lib/catalog";
import { formatPostDate } from "@/lib/site";

export const metadata: Metadata = {
  title: "Home care guides",
  description: "Practical tips for AC care, appliances, water tanks and keeping your home running smoothly.",
  alternates: { canonical: "/blog" },
};

export const revalidate = 300;

export default async function BlogIndexPage() {
  const posts = await api.blogPosts().then((r) => r.results).catch(() => null as BlogPost[] | null);
  return (
    <ContentPage eyebrow="Guides" title="Home care guides" intro="Simple, practical advice from our professionals.">
      {posts === null ? (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Guides are unavailable right now. Please try again shortly.</p>
      ) : posts.length === 0 ? (
        <p className="text-[#57534E]">New guides are coming soon.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/blog/${post.slug}`} className="group block h-full overflow-hidden rounded-lg border border-[#EAE3DC] bg-white transition hover:border-[#800020]/40">
                {post.cover_image_url && (
                  <div className="relative aspect-[16/9] bg-[#F4EFE9]">
                    <ServiceImage src={post.cover_image_url} alt="" fit="cover" />
                  </div>
                )}
                <div className="p-4">
                  <h2 className="text-base font-bold text-[#1C1917] group-hover:text-[#800020]">{post.title}</h2>
                  {post.excerpt && <p className="mt-1.5 line-clamp-3 text-sm text-[#57534E]">{post.excerpt}</p>}
                  <p className="mt-3 text-xs text-[#78716C]">{[post.author_name, formatPostDate(post.published_at)].filter(Boolean).join(" · ")}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ContentPage>
  );
}
