import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError } from "@nammapros/api-client";
import { ContentPage } from "@/components/content-page";
import { ServiceImage } from "@/components/service-image";
import { api } from "@/lib/catalog";
import { formatPostDate, site, toParagraphs } from "@/lib/site";

export const revalidate = 300;

async function loadPost(slug: string) {
  try {
    return await api.blogPost(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const post = await api.blogPost(slug);
    return {
      title: post.meta_title || post.title,
      description: post.meta_description || post.excerpt,
      alternates: { canonical: `/blog/${post.slug}` },
      openGraph: { type: "article", title: post.title, images: post.cover_image_url ? [post.cover_image_url] : undefined },
    };
  } catch {
    return { title: "Guide" };
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await loadPost(slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    datePublished: post.published_at ?? undefined,
    author: { "@type": "Organization", name: post.author_name || site.name },
    image: post.cover_image_url || undefined,
    mainEntityOfPage: `${site.url}/blog/${post.slug}`,
  };
  return (
    <ContentPage title={post.title}
      intro={post.excerpt || undefined}
      updated={formatPostDate(post.published_at) || undefined}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {post.cover_image_url && (
        <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-[#F4EFE9]">
          <ServiceImage src={post.cover_image_url} alt="" fit="cover" />
        </div>
      )}
      <article className="space-y-4">
        {toParagraphs(post.content).map((p, i) => (
          <p key={i} className="whitespace-pre-line">{p}</p>
        ))}
      </article>
      <div className="rounded-lg bg-[#F6E7EB] p-4 text-sm text-[#5C0017]">
        Need a hand? <Link href="/services" className="font-bold underline">Book a verified professional</Link>.
      </div>
    </ContentPage>
  );
}
