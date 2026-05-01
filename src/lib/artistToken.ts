/**
 * Artist token generator
 *
 * Produces human-friendly client link slugs made of three famous artist names,
 * e.g. "monet-warhol-basquiat".
 *
 * With ~90 artists the combinatorial space is ~90 × 89 × 88 ≈ 704,880 unique
 * ordered triples — comfortably large for an art consultancy.
 */

const ARTISTS: string[] = [
  // Impressionism & Post-Impressionism
  'monet', 'renoir', 'degas', 'cezanne', 'pissarro', 'sisley', 'seurat', 'signac', 'gauguin', 'vangogh',

  // Early Modern
  'klimt', 'schiele', 'munch', 'kandinsky', 'klee', 'mondrian', 'malevich', 'kirchner', 'nolde', 'beckmann',

  // Cubism & Fauvism
  'picasso', 'braque', 'leger', 'matisse', 'derain', 'vlaminck', 'dufy', 'delaunay',

  // Surrealism & Dada
  'dali', 'miro', 'magritte', 'ernst', 'kahlo', 'tanguy', 'arp', 'duchamp', 'chirico',

  // Abstract Expressionism
  'pollock', 'koooning', 'rothko', 'newman', 'kline', 'motherwell', 'frankenthaler',
  'diebenkorn', 'reinhardt', 'guston',

  // Pop Art & Neo-Dada
  'warhol', 'lichtenstein', 'johns', 'rauschenberg', 'hamilton', 'oldenburg', 'wesselmann', 'rosenquist',

  // Minimalism & Conceptual
  'judd', 'stella', 'flavin', 'andre', 'lewitt', 'turrell', 'nauman', 'hesse', 'bourgeois',

  // Contemporary
  'basquiat', 'haring', 'koons', 'hirst', 'emin', 'ofili', 'shrigley', 'cattelan',
  'kapoor', 'ai', 'wall', 'gursky', 'prince', 'sherman', 'barney',
]

/**
 * Pick n distinct elements from an array at random.
 */
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  const result: T[] = []
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * (copy.length - i))
    result.push(copy[idx])
    copy[idx] = copy[copy.length - 1 - i]
  }
  return result
}

/**
 * Generate a single artist-name token, e.g. "monet-warhol-basquiat".
 */
export function generateArtistToken(): string {
  return sample(ARTISTS, 3).join('-')
}
