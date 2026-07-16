CREATE TRIGGER `product_likes_count_insert`
AFTER INSERT ON `product_likes`
BEGIN
  UPDATE `products`
  SET `likes_count` = `likes_count` + 1
  WHERE `id` = NEW.`product_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `product_likes_count_delete`
AFTER DELETE ON `product_likes`
BEGIN
  UPDATE `products`
  SET `likes_count` = MAX(0, `likes_count` - 1)
  WHERE `id` = OLD.`product_id`;
END;
